"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOLS = void 0;
/**
 * All MCP tool definitions for the Forgejo MCP server.
 */
exports.TOOLS = [
    {
        name: "search_issues",
        description: "Search for issues and pull requests across all repositories on the Forgejo instance. " +
            "Uses GET /api/v1/repos/issues/search.",
        inputSchema: {
            type: "object",
            properties: {
                q: {
                    type: "string",
                    description: "Keyword to search in issue titles and bodies.",
                },
                type: {
                    type: "string",
                    enum: ["issues", "pulls"],
                    description: "Filter by type: 'issues' for issues only, 'pulls' for pull requests only.",
                },
                state: {
                    type: "string",
                    enum: ["open", "closed"],
                    description: "Filter by issue state. Defaults to open.",
                },
                labels: {
                    type: "string",
                    description: "Comma-separated list of label names to filter by.",
                },
                owner: {
                    type: "string",
                    description: "Filter issues by repository owner (user or org login).",
                },
                team: {
                    type: "string",
                    description: "Filter issues by team (requires 'owner' to be an organization).",
                },
                assigned: {
                    type: "boolean",
                    description: "Only return issues assigned to the authenticated user.",
                },
                created: {
                    type: "boolean",
                    description: "Only return issues created by the authenticated user.",
                },
                mentioned: {
                    type: "boolean",
                    description: "Only return issues that mention the authenticated user.",
                },
                review_requested: {
                    type: "boolean",
                    description: "Only return pull requests requesting a review from the authenticated user.",
                },
                since: {
                    type: "string",
                    description: "Only show issues updated after this date (ISO 8601 / RFC 3339).",
                },
                before: {
                    type: "string",
                    description: "Only show issues updated before this date (ISO 8601 / RFC 3339).",
                },
                page: {
                    type: "integer",
                    description: "Page number for pagination (1-based). Default: 1.",
                    minimum: 1,
                },
                limit: {
                    type: "integer",
                    description: "Results per page (max 50). Default: 10.",
                    minimum: 1,
                    maximum: 50,
                },
            },
        },
    },
    {
        name: "list_issues",
        description: "List issues in a specific repository. Uses GET /api/v1/repos/{owner}/{repo}/issues.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo"],
            properties: {
                owner: {
                    type: "string",
                    description: "Repository owner (user or org login).",
                },
                repo: {
                    type: "string",
                    description: "Repository name.",
                },
                state: {
                    type: "string",
                    enum: ["open", "closed", "all"],
                    description: "Filter by state. Default: open.",
                },
                type: {
                    type: "string",
                    enum: ["issues", "pulls"],
                    description: "Filter by type.",
                },
                labels: {
                    type: "string",
                    description: "Comma-separated list of label names.",
                },
                page: {
                    type: "integer",
                    description: "Page number for pagination (1-based).",
                    minimum: 1,
                },
                limit: {
                    type: "integer",
                    description: "Results per page (max 50). Default: 10.",
                    minimum: 1,
                    maximum: 50,
                },
            },
        },
    },
    {
        name: "get_issue",
        description: "Get details of a specific issue or pull request. Uses GET /api/v1/repos/{owner}/{repo}/issues/{index}.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: {
                    type: "string",
                    description: "Repository owner.",
                },
                repo: {
                    type: "string",
                    description: "Repository name.",
                },
                index: {
                    type: "integer",
                    description: "Issue or pull request number.",
                    minimum: 1,
                },
            },
        },
    },
    {
        name: "create_issue",
        description: "Create a new issue in a repository. Uses POST /api/v1/repos/{owner}/{repo}/issues.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "title"],
            properties: {
                owner: {
                    type: "string",
                    description: "Repository owner.",
                },
                repo: {
                    type: "string",
                    description: "Repository name.",
                },
                title: {
                    type: "string",
                    description: "Title of the issue.",
                },
                body: {
                    type: "string",
                    description: "Description / body of the issue (Markdown supported).",
                },
                assignees: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of user logins to assign to the issue.",
                },
                labels: {
                    type: "array",
                    items: { type: "integer" },
                    description: "List of label IDs to attach.",
                },
                milestone: {
                    type: "integer",
                    description: "Milestone ID to associate with the issue.",
                },
            },
        },
    },
    {
        name: "edit_issue",
        description: "Edit an existing issue (change title, body, state, assignees, etc.). " +
            "Uses PATCH /api/v1/repos/{owner}/{repo}/issues/{index}.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Issue number.",
                    minimum: 1,
                },
                title: { type: "string", description: "New title." },
                body: { type: "string", description: "New body." },
                state: {
                    type: "string",
                    enum: ["open", "closed"],
                    description: "New state.",
                },
                assignees: {
                    type: "array",
                    items: { type: "string" },
                    description: "New list of assignee logins (replaces existing).",
                },
                milestone: {
                    type: "integer",
                    description: "Milestone ID (use 0 to clear).",
                },
            },
        },
    },
    {
        name: "list_issue_comments",
        description: "List comments on an issue or pull request. " +
            "Uses GET /api/v1/repos/{owner}/{repo}/issues/{index}/comments.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Issue number.",
                    minimum: 1,
                },
                page: { type: "integer", description: "Page number.", minimum: 1 },
                limit: {
                    type: "integer",
                    description: "Results per page (max 50).",
                    minimum: 1,
                    maximum: 50,
                },
            },
        },
    },
    {
        name: "create_comment",
        description: "Add a comment to an issue or pull request. " +
            "Uses POST /api/v1/repos/{owner}/{repo}/issues/{index}/comments.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index", "body"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Issue number.",
                    minimum: 1,
                },
                body: { type: "string", description: "Comment text (Markdown)." },
            },
        },
    },
    {
        name: "search_repos",
        description: "Search for repositories on the Forgejo instance. Uses GET /api/v1/repos/search.",
        inputSchema: {
            type: "object",
            properties: {
                q: {
                    type: "string",
                    description: "Keyword to search in repository name/description.",
                },
                topic: {
                    type: "boolean",
                    description: "Whether to search by topic.",
                },
                include_desc: {
                    type: "boolean",
                    description: "Include description in search.",
                },
                owner: {
                    type: "string",
                    description: "Filter by owner (user or org login).",
                },
                is_private: {
                    type: "boolean",
                    description: "Filter private or public repos.",
                },
                archived: {
                    type: "boolean",
                    description: "Include archived repositories.",
                },
                page: { type: "integer", description: "Page number.", minimum: 1 },
                limit: {
                    type: "integer",
                    description: "Results per page (max 50).",
                    minimum: 1,
                    maximum: 50,
                },
            },
        },
    },
    {
        name: "get_repo",
        description: "Get details of a specific repository. Uses GET /api/v1/repos/{owner}/{repo}.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
            },
        },
    },
    {
        name: "get_git_token",
        description: "Get the git access token and the Forgejo server URL configured for this MCP server. " +
            "Useful when you need to perform git operations (clone, push, pull) that require authentication.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "get_user",
        description: "Get the profile of the currently authenticated user. Uses GET /api/v1/user.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
    {
        name: "get_user_info",
        description: "Get the public profile of any user by login. Uses GET /api/v1/users/{username}.",
        inputSchema: {
            type: "object",
            required: ["username"],
            properties: {
                username: { type: "string", description: "The user's login name." },
            },
        },
    },
    {
        name: "list_notifications",
        description: "List notifications for the authenticated user. Uses GET /api/v1/notifications.",
        inputSchema: {
            type: "object",
            properties: {
                all: {
                    type: "boolean",
                    description: "If true, return all notifications including already read ones.",
                },
                since: {
                    type: "string",
                    description: "Only show notifications updated after this date.",
                },
                before: {
                    type: "string",
                    description: "Only show notifications updated before this date.",
                },
                page: { type: "integer", description: "Page number.", minimum: 1 },
                limit: {
                    type: "integer",
                    description: "Results per page (max 50).",
                    minimum: 1,
                    maximum: 50,
                },
            },
        },
    },
    {
        name: "mark_notification_read",
        description: "Mark a single notification thread as read. " +
            "Uses PATCH /api/v1/notifications/threads/{id}.",
        inputSchema: {
            type: "object",
            required: ["id"],
            properties: {
                id: {
                    type: "integer",
                    description: "Notification thread ID.",
                    minimum: 1,
                },
            },
        },
    },
    {
        name: "mark_all_notifications_read",
        description: "Mark all notifications as read. Optionally filter by date. " +
            "Uses PUT /api/v1/notifications.",
        inputSchema: {
            type: "object",
            properties: {
                last_read_at: {
                    type: "string",
                    description: "Mark notifications as read up to this date (ISO 8601 / RFC 3339). " +
                        "Defaults to current time if omitted.",
                },
            },
        },
    },
    // -------------------------------------------------------------------------
    // Pull Request tools
    // -------------------------------------------------------------------------
    {
        name: "list_pull_requests",
        description: "List pull requests in a repository. Uses GET /api/v1/repos/{owner}/{repo}/pulls.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo"],
            properties: {
                owner: {
                    type: "string",
                    description: "Repository owner (user or org login).",
                },
                repo: {
                    type: "string",
                    description: "Repository name.",
                },
                state: {
                    type: "string",
                    enum: ["open", "closed", "all"],
                    description: "Filter by state. Default: open.",
                },
                sort: {
                    type: "string",
                    enum: [
                        "oldest",
                        "recentupdate",
                        "leastupdate",
                        "mostcomment",
                        "leastcomment",
                        "priority",
                    ],
                    description: "Sort order for results.",
                },
                labels: {
                    type: "string",
                    description: "Comma-separated list of label IDs to filter by.",
                },
                milestone: {
                    type: "integer",
                    description: "Milestone ID to filter by.",
                },
                page: {
                    type: "integer",
                    description: "Page number for pagination (1-based).",
                    minimum: 1,
                },
                limit: {
                    type: "integer",
                    description: "Results per page (max 50). Default: 10.",
                    minimum: 1,
                    maximum: 50,
                },
            },
        },
    },
    {
        name: "get_pull_request",
        description: "Get details of a specific pull request. Uses GET /api/v1/repos/{owner}/{repo}/pulls/{index}.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: {
                    type: "string",
                    description: "Repository owner.",
                },
                repo: {
                    type: "string",
                    description: "Repository name.",
                },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
            },
        },
    },
    {
        name: "create_pull_request",
        description: "Create a new pull request. Uses POST /api/v1/repos/{owner}/{repo}/pulls.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "title", "head", "base"],
            properties: {
                owner: {
                    type: "string",
                    description: "Repository owner.",
                },
                repo: {
                    type: "string",
                    description: "Repository name.",
                },
                title: {
                    type: "string",
                    description: "Title of the pull request.",
                },
                body: {
                    type: "string",
                    description: "Description / body of the pull request (Markdown supported).",
                },
                head: {
                    type: "string",
                    description: "Source branch for the pull request.",
                },
                base: {
                    type: "string",
                    description: "Target branch for the pull request.",
                },
                assignees: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of user logins to assign.",
                },
                labels: {
                    type: "array",
                    items: { type: "integer" },
                    description: "List of label IDs to attach.",
                },
                milestone: {
                    type: "integer",
                    description: "Milestone ID to associate.",
                },
            },
        },
    },
    {
        name: "edit_pull_request",
        description: "Update an existing pull request (title, body, state, etc.). " +
            "Uses PATCH /api/v1/repos/{owner}/{repo}/pulls/{index}.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                title: { type: "string", description: "New title." },
                body: { type: "string", description: "New body." },
                state: {
                    type: "string",
                    enum: ["open", "closed"],
                    description: "New state.",
                },
                base: {
                    type: "string",
                    description: "New target branch.",
                },
                assignees: {
                    type: "array",
                    items: { type: "string" },
                    description: "New list of assignee logins (replaces existing).",
                },
                labels: {
                    type: "array",
                    items: { type: "integer" },
                    description: "New list of label IDs (replaces existing).",
                },
                milestone: {
                    type: "integer",
                    description: "Milestone ID (use 0 to clear).",
                },
            },
        },
    },
    {
        name: "merge_pull_request",
        description: "Merge a pull request. Uses POST /api/v1/repos/{owner}/{repo}/pulls/{index}/merge.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index", "Do"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                Do: {
                    type: "string",
                    enum: ["merge", "rebase", "rebase-merge", "squash", "manually-merged"],
                    description: "Merge method to use.",
                },
                merge_commit_id: {
                    type: "string",
                    description: "Merge commit ID (required for manually-merged).",
                },
                merge_message_field: {
                    type: "string",
                    description: "Custom merge commit message.",
                },
                delete_branch_after_merge: {
                    type: "boolean",
                    description: "Delete source branch after merge.",
                },
                force_merge: {
                    type: "boolean",
                    description: "Force merge even if reviews/checks are pending.",
                },
                head_commit_id: {
                    type: "string",
                    description: "Expected head commit SHA for optimistic locking.",
                },
                merge_when_checks_succeed: {
                    type: "boolean",
                    description: "Auto-merge when all checks pass.",
                },
            },
        },
    },
    {
        name: "get_pull_request_diff",
        description: "Get the diff of a pull request as plain text. " +
            "Uses GET /api/v1/repos/{owner}/{repo}/pulls/{index}.diff.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
            },
        },
    },
    {
        name: "get_pull_request_files",
        description: "Get the list of files changed in a pull request. " +
            "Uses GET /api/v1/repos/{owner}/{repo}/pulls/{index}/files.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                skip: {
                    type: "integer",
                    description: "Number of files to skip (for pagination).",
                    minimum: 0,
                },
                limit: {
                    type: "integer",
                    description: "Number of files to return (max 50). Default: 10.",
                    minimum: 1,
                    maximum: 50,
                },
            },
        },
    },
    {
        name: "list_pull_request_reviews",
        description: "List reviews on a pull request. " +
            "Uses GET /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                page: { type: "integer", description: "Page number.", minimum: 1 },
                limit: {
                    type: "integer",
                    description: "Results per page (max 50).",
                    minimum: 1,
                    maximum: 50,
                },
            },
        },
    },
    {
        name: "update_pull_request_branch",
        description: "Update a pull request branch with the base branch (rebase or merge). " +
            "Uses POST /api/v1/repos/{owner}/{repo}/pulls/{index}/update.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                style: {
                    type: "string",
                    enum: ["rebase", "merge"],
                    description: "How to update the branch: 'rebase' or 'merge'. Default: merge.",
                },
            },
        },
    },
    // -------------------------------------------------------------------------
    // Pull Request Review tools
    // -------------------------------------------------------------------------
    {
        name: "create_pull_request_review",
        description: "Create/submit a review on a pull request. You can approve, request changes, " +
            "leave a comment, or create a pending review with optional line-level comments. " +
            "Uses POST /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index", "event"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                event: {
                    type: "string",
                    enum: ["APPROVED", "REQUEST_CHANGES", "COMMENT", "PENDING"],
                    description: "Review event type: APPROVED, REQUEST_CHANGES, COMMENT, or PENDING.",
                },
                body: {
                    type: "string",
                    description: "Review body/comment (Markdown supported).",
                },
                commit_id: {
                    type: "string",
                    description: "SHA of the commit to review. Defaults to the latest commit if omitted.",
                },
                comments: {
                    type: "array",
                    description: "Line-level comments to include with the review.",
                    items: {
                        type: "object",
                        required: ["body", "path"],
                        properties: {
                            body: {
                                type: "string",
                                description: "Comment text (Markdown supported).",
                            },
                            path: {
                                type: "string",
                                description: "Relative file path the comment refers to.",
                            },
                            new_position: {
                                type: "integer",
                                description: "Line number in the new file (for added/changed lines).",
                            },
                            old_position: {
                                type: "integer",
                                description: "Line number in the old file (for removed lines).",
                            },
                        },
                    },
                },
            },
        },
    },
    {
        name: "get_pull_request_review",
        description: "Get details of a specific review on a pull request. " +
            "Uses GET /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews/{review_id}.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index", "review_id"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                review_id: {
                    type: "integer",
                    description: "Review ID.",
                    minimum: 1,
                },
            },
        },
    },
    {
        name: "submit_pull_request_review",
        description: "Submit a pending review on a pull request. " +
            "Uses POST /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews/{review_id}.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index", "review_id", "event"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                review_id: {
                    type: "integer",
                    description: "Review ID of the pending review.",
                    minimum: 1,
                },
                event: {
                    type: "string",
                    enum: ["APPROVED", "REQUEST_CHANGES", "COMMENT"],
                    description: "Review event to submit as.",
                },
                body: {
                    type: "string",
                    description: "Updated review body (Markdown supported).",
                },
            },
        },
    },
    {
        name: "delete_pull_request_review",
        description: "Delete a review on a pull request. " +
            "Uses DELETE /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews/{review_id}.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index", "review_id"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                review_id: {
                    type: "integer",
                    description: "Review ID to delete.",
                    minimum: 1,
                },
            },
        },
    },
    {
        name: "dismiss_pull_request_review",
        description: "Dismiss a review on a pull request. " +
            "Uses POST /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews/{review_id}/dismissals.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index", "review_id", "message"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                review_id: {
                    type: "integer",
                    description: "Review ID to dismiss.",
                    minimum: 1,
                },
                message: {
                    type: "string",
                    description: "Reason for dismissing the review.",
                },
            },
        },
    },
    {
        name: "get_pull_request_review_comments",
        description: "List comments of a specific review on a pull request. " +
            "Uses GET /api/v1/repos/{owner}/{repo}/pulls/{index}/reviews/{review_id}/comments.",
        inputSchema: {
            type: "object",
            required: ["owner", "repo", "index", "review_id"],
            properties: {
                owner: { type: "string", description: "Repository owner." },
                repo: { type: "string", description: "Repository name." },
                index: {
                    type: "integer",
                    description: "Pull request number.",
                    minimum: 1,
                },
                review_id: {
                    type: "integer",
                    description: "Review ID.",
                    minimum: 1,
                },
            },
        },
    },
];
//# sourceMappingURL=tools.js.map