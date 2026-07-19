using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wander.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddMediaAssetDeletedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                table: "media_assets",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "media_assets");
        }
    }
}
