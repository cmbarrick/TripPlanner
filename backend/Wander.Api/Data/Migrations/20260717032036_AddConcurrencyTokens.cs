using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wander.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddConcurrencyTokens : Migration
    {
        // No-op by design: `xmin` is a system column Postgres already maintains on every table
        // (auto-incremented on each row update), not a new column to create. Mapping Trip/Note/
        // ItineraryItem.Version onto it (see WanderDbContext.MapXminConcurrencyToken) only changes
        // what EF Core's model *knows about* — the generated AddColumn/DropColumn calls here would
        // fail at runtime (Postgres reserves "xmin" and rejects creating or dropping it), so this
        // migration exists purely to update the model snapshot for future migrations to diff
        // against. See https://www.npgsql.org/efcore/modeling/concurrency.html.

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
