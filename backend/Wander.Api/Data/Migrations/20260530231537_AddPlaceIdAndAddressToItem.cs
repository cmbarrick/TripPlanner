using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wander.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPlaceIdAndAddressToItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "ItineraryItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PlaceId",
                table: "ItineraryItems",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Address",
                table: "ItineraryItems");

            migrationBuilder.DropColumn(
                name: "PlaceId",
                table: "ItineraryItems");
        }
    }
}
