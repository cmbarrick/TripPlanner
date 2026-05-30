using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wander.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddItemStatusAndBacklog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ItineraryItems_Days_DayId",
                table: "ItineraryItems");

            migrationBuilder.DropIndex(
                name: "IX_ItineraryItems_DayId_SortOrder",
                table: "ItineraryItems");

            migrationBuilder.AlterColumn<Guid>(
                name: "DayId",
                table: "ItineraryItems",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "ItineraryItems",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "TripId",
                table: "ItineraryItems",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            // Backfill TripId for pre-existing items from the day they belong to.
            migrationBuilder.Sql(@"
                UPDATE ""ItineraryItems"" AS i
                SET ""TripId"" = d.""TripId""
                FROM ""Days"" AS d
                WHERE i.""DayId"" = d.""Id"" AND i.""TripId"" = '00000000-0000-0000-0000-000000000000';");

            migrationBuilder.CreateIndex(
                name: "IX_ItineraryItems_DayId",
                table: "ItineraryItems",
                column: "DayId");

            migrationBuilder.CreateIndex(
                name: "IX_ItineraryItems_TripId_DayId_SortOrder",
                table: "ItineraryItems",
                columns: new[] { "TripId", "DayId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_ItineraryItems_Days_DayId",
                table: "ItineraryItems",
                column: "DayId",
                principalTable: "Days",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ItineraryItems_Days_DayId",
                table: "ItineraryItems");

            migrationBuilder.DropIndex(
                name: "IX_ItineraryItems_DayId",
                table: "ItineraryItems");

            migrationBuilder.DropIndex(
                name: "IX_ItineraryItems_TripId_DayId_SortOrder",
                table: "ItineraryItems");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "ItineraryItems");

            migrationBuilder.DropColumn(
                name: "TripId",
                table: "ItineraryItems");

            migrationBuilder.AlterColumn<Guid>(
                name: "DayId",
                table: "ItineraryItems",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ItineraryItems_DayId_SortOrder",
                table: "ItineraryItems",
                columns: new[] { "DayId", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_ItineraryItems_Days_DayId",
                table: "ItineraryItems",
                column: "DayId",
                principalTable: "Days",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
