using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wander.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPublicRecaps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "public_recaps",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RecapId = table.Column<Guid>(type: "uuid", nullable: false),
                    TripId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<string>(type: "text", nullable: false),
                    ModerationStatus = table.Column<int>(type: "integer", nullable: false),
                    ModerationReason = table.Column<string>(type: "text", nullable: true),
                    Places = table.Column<List<string>>(type: "text[]", nullable: false),
                    Tags = table.Column<List<string>>(type: "text[]", nullable: false),
                    Season = table.Column<string>(type: "text", nullable: true),
                    BudgetBand = table.Column<string>(type: "text", nullable: true),
                    PublishedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_public_recaps", x => x.Id);
                    table.ForeignKey(
                        name: "FK_public_recaps_recaps_RecapId",
                        column: x => x.RecapId,
                        principalTable: "recaps",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_public_recaps_ModerationStatus_DeletedAt",
                table: "public_recaps",
                columns: new[] { "ModerationStatus", "DeletedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_public_recaps_OwnerId",
                table: "public_recaps",
                column: "OwnerId");

            migrationBuilder.CreateIndex(
                name: "IX_public_recaps_RecapId",
                table: "public_recaps",
                column: "RecapId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "public_recaps");
        }
    }
}
