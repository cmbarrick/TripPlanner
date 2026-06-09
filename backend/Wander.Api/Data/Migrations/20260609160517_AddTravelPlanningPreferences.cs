using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wander.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddTravelPlanningPreferences : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BudgetBand",
                table: "Preferences",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Diet",
                table: "Preferences",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Pace",
                table: "Preferences",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TravelStyle",
                table: "Preferences",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BudgetBand",
                table: "Preferences");

            migrationBuilder.DropColumn(
                name: "Diet",
                table: "Preferences");

            migrationBuilder.DropColumn(
                name: "Pace",
                table: "Preferences");

            migrationBuilder.DropColumn(
                name: "TravelStyle",
                table: "Preferences");
        }
    }
}
