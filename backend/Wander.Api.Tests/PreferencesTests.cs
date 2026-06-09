using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Wander.Api.Controllers;
using Wander.Api.Data;

namespace Wander.Api.Tests;

public class PreferencesControllerTests
{
    private const string OwnerId = "owner-user";
    private const string OtherUserId = "other-user";

    [Fact]
    public async Task Get_FirstCall_CreatesDefaults()
    {
        var (ctrl, ctx) = Build();
        var ok = Assert.IsType<OkObjectResult>((await ctrl.Get(CancellationToken.None)).Result);
        var body = Assert.IsType<PreferencesController.PreferencesResponse>(ok.Value);

        Assert.Equal("F", body.TemperatureUnit);
        Assert.Null(body.TravelStyle);
        Assert.Single(ctx.Users);
        Assert.Single(ctx.Preferences);
    }

    [Fact]
    public async Task Get_SecondCall_ReturnsSameRow()
    {
        var (ctrl, ctx) = Build();
        await ctrl.Get(CancellationToken.None);
        await ctrl.Get(CancellationToken.None);
        Assert.Single(ctx.Preferences);
    }

    [Fact]
    public async Task Update_TravelFields_PersistsNormalizedValues()
    {
        var (ctrl, ctx) = Build();
        var request = new PreferencesController.UpdatePreferencesRequest(
            TravelStyle: "Foodie",
            Pace: "RELAXED",
            Diet: "vegetarian",
            BudgetBand: "mid",
            TemperatureUnit: "C");

        var ok = Assert.IsType<OkObjectResult>((
            await ctrl.Update(request, CancellationToken.None)).Result);
        var body = Assert.IsType<PreferencesController.PreferencesResponse>(ok.Value);

        Assert.Equal("foodie", body.TravelStyle);
        Assert.Equal("relaxed", body.Pace);
        Assert.Equal("vegetarian", body.Diet);
        Assert.Equal("mid", body.BudgetBand);
        Assert.Equal("C", body.TemperatureUnit);

        var stored = ctx.Preferences.Single();
        Assert.Equal("foodie", stored.TravelStyle);
    }

    [Fact]
    public async Task Update_InvalidTravelStyle_ReturnsBadRequest()
    {
        var (ctrl, _) = Build();
        var result = await ctrl.Update(
            new PreferencesController.UpdatePreferencesRequest(TravelStyle: "party-hard"),
            CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Update_Partial_LeavesOtherFieldsUntouched()
    {
        var (ctrl, _) = Build();
        await ctrl.Update(
            new PreferencesController.UpdatePreferencesRequest(
                TravelStyle: "culture",
                Pace: "moderate"),
            CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>((
            await ctrl.Update(
                new PreferencesController.UpdatePreferencesRequest(BudgetBand: "luxury"),
                CancellationToken.None)).Result);
        var body = Assert.IsType<PreferencesController.PreferencesResponse>(ok.Value);

        Assert.Equal("culture", body.TravelStyle);
        Assert.Equal("moderate", body.Pace);
        Assert.Equal("luxury", body.BudgetBand);
    }

    [Fact]
    public async Task Get_AsOtherUser_GetsSeparateDefaults()
    {
        var (ctrl, ctx) = Build();
        await ctrl.Get(CancellationToken.None);

        ctrl.ControllerContext = FakeAuth.ForUser(OtherUserId);
        await ctrl.Get(CancellationToken.None);

        Assert.Equal(2, ctx.Users.Count());
        Assert.Equal(2, ctx.Preferences.Count());
    }

    private static (PreferencesController ctrl, WanderDbContext ctx) Build()
    {
        var ctx = new WanderDbContext(
            new DbContextOptionsBuilder<WanderDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString())
                .Options);
        var ctrl = new PreferencesController(new PreferenceService(ctx))
        {
            ControllerContext = FakeAuth.ForUser(OwnerId),
        };
        return (ctrl, ctx);
    }
}
