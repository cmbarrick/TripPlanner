using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Wander.Api.Data;
using Wander.Api.Models;
using Wander.Api.Realtime;

namespace Wander.Api.Tests;

/// <summary>
/// A real ASP.NET Core test host (SignalR hub + controllers wired exactly as in production) backed
/// by an EF Core in-memory database. <see cref="WanderDbContext"/>'s Npgsql registration is swapped
/// for an in-memory one so the app boots without a real Postgres instance.
/// </summary>
public class RealtimeWebAppFactory : WebApplicationFactory<Program>
{
    public readonly string DbName = Guid.NewGuid().ToString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:DevBypass:Enabled"] = "true",
                ["Database:MigrateOnStartup"] = "false",
                ["Weather:UseFake"] = "true",
            });
        });

        builder.ConfigureServices(services =>
        {
            // EF Core 8+ registers each AddDbContext call's configuration additively
            // (IDbContextOptionsConfiguration<T>), so the original Npgsql setup must be removed
            // too — not just the DbContextOptions<T> descriptor — or both providers get applied.
            services.RemoveAll<DbContextOptions<WanderDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<WanderDbContext>>();
            services.AddDbContext<WanderDbContext>(options => options.UseInMemoryDatabase(DbName));
        });
    }
}

/// <summary>
/// Phase 7, Slice 5 close-out: a live two-client realtime session against the real SignalR pipeline
/// (not a fake/mock) — presence joins/leaves and a genuine HTTP write (reaction toggle) broadcasting
/// to both connected peers.
/// </summary>
public class RealtimeE2ETests : IClassFixture<RealtimeWebAppFactory>
{
    private const string OwnerId = "owner-a";
    private const string MemberId = "friend-b";

    private readonly RealtimeWebAppFactory _factory;

    public RealtimeE2ETests(RealtimeWebAppFactory factory) => _factory = factory;

    [Fact]
    public async Task TwoClients_SeePresenceAndLiveReactionBroadcast()
    {
        var tripId = SeedTripWithMember();

        await using var ownerConn = BuildConnection(OwnerId);
        await using var memberConn = BuildConnection(MemberId);

        var ownerPresence = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var memberPresence = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var ownerSawChange = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var memberSawChange = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);

        ownerConn.On<PresenceMessage>("Presence", msg =>
        {
            if (msg.Present.Count >= 2) ownerPresence.TrySetResult(msg.Present.Count);
        });
        memberConn.On<PresenceMessage>("Presence", msg =>
        {
            if (msg.Present.Count >= 2) memberPresence.TrySetResult(msg.Present.Count);
        });
        ownerConn.On<TripChangedMessage>("TripChanged", msg => ownerSawChange.TrySetResult(msg.ChangeKind));
        memberConn.On<TripChangedMessage>("TripChanged", msg => memberSawChange.TrySetResult(msg.ChangeKind));

        await ownerConn.StartAsync();
        await memberConn.StartAsync();

        await ownerConn.InvokeAsync("JoinTrip", tripId);
        await memberConn.InvokeAsync("JoinTrip", tripId);

        // Both peers observe presence settle at 2 (themselves + the other) once both have joined.
        Assert.Equal(2, await WithTimeout(ownerPresence.Task));
        Assert.Equal(2, await WithTimeout(memberPresence.Task));

        // A genuine HTTP write — the member reacts via the real ReactionsController — must broadcast
        // to both live connections, including the actor's own.
        using var http = _factory.CreateClient();
        http.DefaultRequestHeaders.Add("X-Dev-User-Id", MemberId);
        var response = await http.PostAsJsonAsync(
            $"/api/trips/{tripId}/reactions",
            new { targetType = "Trip", targetId = tripId, emoji = "🎉" });
        response.EnsureSuccessStatusCode();

        Assert.Equal("reactions", await WithTimeout(ownerSawChange.Task));
        Assert.Equal("reactions", await WithTimeout(memberSawChange.Task));

        // Leaving drops presence back to 1 for the remaining peer.
        var ownerPresenceAfterLeave = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        ownerConn.On<PresenceMessage>("Presence", msg => ownerPresenceAfterLeave.TrySetResult(msg.Present.Count));
        await memberConn.InvokeAsync("LeaveTrip", tripId);
        Assert.Equal(1, await WithTimeout(ownerPresenceAfterLeave.Task));
    }

    private HubConnection BuildConnection(string devUserId) =>
        new HubConnectionBuilder()
            .WithUrl($"{_factory.Server.BaseAddress}hubs/trips?dev_user_id={devUserId}", options =>
            {
                options.HttpMessageHandlerFactory = _ => _factory.Server.CreateHandler();
                options.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
            })
            .Build();

    private static async Task<T> WithTimeout<T>(Task<T> task)
    {
        var completed = await Task.WhenAny(task, Task.Delay(TimeSpan.FromSeconds(10)));
        Assert.Same(task, completed);
        return await task;
    }

    private Guid SeedTripWithMember()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<WanderDbContext>();
        var users = new UserService(db);
        var shares = new TripShareService(db, new EfCoreTripRepository(db), users);

        var trip = new EfCoreTripRepository(db).Add(new Trip
        {
            OwnerId = OwnerId,
            Title = "Realtime E2E Trip",
            Destination = "Kyoto, Japan",
            StartDate = new DateOnly(2026, 9, 1),
            EndDate = new DateOnly(2026, 9, 3),
            Travelers = 2,
            CoverTheme = "kyoto",
            EstimatedCost = 900m,
            Currency = "JPY",
            Days = [new Day { DayNumber = 1, Date = new DateOnly(2026, 9, 1) }],
        });

        var link = shares.CreateLink(trip.Id, OwnerId, TripMemberRole.Editor, null);
        shares.Redeem(link.Token, MemberId);

        return trip.Id;
    }
}
