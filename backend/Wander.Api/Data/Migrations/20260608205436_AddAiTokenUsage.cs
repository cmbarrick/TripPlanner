using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Wander.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAiTokenUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ai_token_usage",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerId = table.Column<string>(type: "text", nullable: false),
                    UsageDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PromptTokens = table.Column<int>(type: "integer", nullable: false),
                    CompletionTokens = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_token_usage", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ai_token_usage_OwnerId_UsageDate",
                table: "ai_token_usage",
                columns: new[] { "OwnerId", "UsageDate" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ai_token_usage");
        }
    }
}
