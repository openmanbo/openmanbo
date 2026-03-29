"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTool = handleTool;
const forgejo_client_js_1 = require("./forgejo-client.js");
/**
 * Format an issue summary for display in MCP tool results.
 */
function formatIssue(issue) {
    const type = issue.pull_request !== undefined ? "Pull Request" : "Issue";
    const labels = issue.labels?.length > 0
        ? issue.labels.map((l) => l.name).join(", ")
        : "none";
    const assignees = issue.assignees && issue.assignees.length > 0
        ? issue.assignees.map((a) => a.login).join(", ")
        : "none";
    const repo = issue.repository ? ` [${issue.repository.full_name}]` : "";
    return [
        `${type} #${issue.number}${repo}: ${issue.title}`,
        `  State: ${issue.state}`,
        `  Author: ${issue.user.login}`,
        `  Labels: ${labels}`,
        `  Assignees: ${assignees}`,
        `  Comments: ${issue.comments}`,
        `  Created: ${issue.created_at}`,
        `  Updated: ${issue.updated_at}`,
        `  URL: ${issue.html_url}`,
        issue.body ? `  Body:\n${issue.body.slice(0, 500)}${issue.body.length > 500 ? "\n  [...]" : ""}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
/**
 * Format a repository summary for display.
 */
function formatRepo(repo) {
    return [
        `${repo.full_name}`,
        `  Description: ${repo.description || "(none)"}`,
        `  Stars: ${repo.stars_count}  Forks: ${repo.forks_count}  Open Issues: ${repo.open_issues_count}`,
        `  Private: ${repo.private}  Archived: ${repo.archived}`,
        `  Default branch: ${repo.default_branch}`,
        `  URL: ${repo.html_url}`,
        `  Updated: ${repo.updated_at}`,
    ].join("\n");
}
/**
 * Format a comment for display.
 */
function formatComment(comment) {
    return [
        `Comment #${comment.id} by ${comment.user.login} at ${comment.created_at}`,
        comment.body,
        `  URL: ${comment.html_url}`,
    ].join("\n");
}
/**
 * Format a pull request summary for display.
 */
function formatPullRequest(pr) {
    const labels = pr.labels?.length > 0
        ? pr.labels.map((l) => l.name).join(", ")
        : "none";
    const assignees = pr.assignees && pr.assignees.length > 0
        ? pr.assignees.map((a) => a.login).join(", ")
        : "none";
    return [
        `PR #${pr.number}: ${pr.title}`,
        `  State: ${pr.state}${pr.merged ? " (merged)" : ""}`,
        `  Author: ${pr.user.login}`,
        `  Head: ${pr.head.label} (${pr.head.sha.slice(0, 7)})`,
        `  Base: ${pr.base.label}`,
        `  Labels: ${labels}`,
        `  Assignees: ${assignees}`,
        `  Comments: ${pr.comments}`,
        `  Mergeable: ${pr.mergeable}`,
        `  Created: ${pr.created_at}`,
        `  Updated: ${pr.updated_at}`,
        `  URL: ${pr.html_url}`,
        pr.body ? `  Body:\n${pr.body.slice(0, 500)}${pr.body.length > 500 ? "\n  [...]" : ""}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
/**
 * Format a pull request review for display.
 */
function formatReview(review) {
    return [
        `Review #${review.id} by ${review.reviewer.login}`,
        `  State: ${review.state}`,
        `  Submitted: ${review.submitted_at}`,
        `  Commit: ${review.commit_id.slice(0, 7)}`,
        review.body ? `  Body: ${review.body}` : "",
        `  URL: ${review.html_url}`,
    ]
        .filter(Boolean)
        .join("\n");
}
/**
 * Format a changed file for display.
 */
function formatChangedFile(file) {
    return [
        `${file.status}: ${file.filename}`,
        `  +${file.additions} -${file.deletions} (${file.changes} changes)`,
        file.previous_filename ? `  Renamed from: ${file.previous_filename}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}
/**
 * Format a notification for display.
 */
function formatNotification(n) {
    return [
        `Notification #${n.id} [${n.unread ? "UNREAD" : "read"}] ${n.subject.type}: ${n.subject.title}`,
        `  Repo: ${n.repository.full_name}`,
        `  State: ${n.subject.state}`,
        `  Updated: ${n.updated_at}`,
        `  URL: ${n.subject.url}`,
    ].join("\n");
}
/**
 * Dispatch a tool call to the appropriate Forgejo API handler and return the
 * result as a human-readable string.
 */
async function handleTool(client, toolName, args) {
    try {
        switch (toolName) {
            case "search_issues":
                return await searchIssues(client, args);
            case "list_issues":
                return await listIssues(client, args);
            case "get_issue":
                return await getIssue(client, args);
            case "create_issue":
                return await createIssue(client, args);
            case "edit_issue":
                return await editIssue(client, args);
            case "list_issue_comments":
                return await listIssueComments(client, args);
            case "create_comment":
                return await createComment(client, args);
            case "search_repos":
                return await searchRepos(client, args);
            case "get_repo":
                return await getRepo(client, args);
            case "get_user":
                return await getUser(client);
            case "get_user_info":
                return await getUserInfo(client, args);
            case "list_notifications":
                return await listNotifications(client, args);
            case "mark_notification_read":
                return await markNotificationRead(client, args);
            case "mark_all_notifications_read":
                return await markAllNotificationsRead(client, args);
            case "list_pull_requests":
                return await listPullRequests(client, args);
            case "get_pull_request":
                return await getPullRequest(client, args);
            case "create_pull_request":
                return await createPullRequest(client, args);
            case "edit_pull_request":
                return await editPullRequest(client, args);
            case "merge_pull_request":
                return await mergePullRequest(client, args);
            case "get_pull_request_diff":
                return await getPullRequestDiff(client, args);
            case "get_pull_request_files":
                return await getPullRequestFiles(client, args);
            case "list_pull_request_reviews":
                return await listPullRequestReviews(client, args);
            case "create_pull_request_review":
                return await createPullRequestReview(client, args);
            case "get_pull_request_review":
                return await getPullRequestReview(client, args);
            case "submit_pull_request_review":
                return await submitPullRequestReview(client, args);
            case "delete_pull_request_review":
                return await deletePullRequestReview(client, args);
            case "dismiss_pull_request_review":
                return await dismissPullRequestReview(client, args);
            case "get_pull_request_review_comments":
                return await getPullRequestReviewComments(client, args);
            case "update_pull_request_branch":
                return await updatePullRequestBranch(client, args);
            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
    catch (err) {
        if (err instanceof forgejo_client_js_1.ForgejoError) {
            return `Error ${err.status}: ${err.message}\nDetails: ${JSON.stringify(err.body, null, 2)}`;
        }
        throw err;
    }
}
// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
async function searchIssues(client, args) {
    const issues = await client.get("/repos/issues/search", {
        q: args.q,
        type: args.type,
        state: args.state ?? "open",
        labels: args.labels,
        owner: args.owner,
        team: args.team,
        assigned: args.assigned,
        created: args.created,
        mentioned: args.mentioned,
        review_requested: args.review_requested,
        since: args.since,
        before: args.before,
        page: args.page ?? 1,
        limit: args.limit ?? 10,
    });
    if (!issues || issues.length === 0) {
        return "No issues found matching the given criteria.";
    }
    return `Found ${issues.length} issue(s):\n\n${issues.map(formatIssue).join("\n\n")}`;
}
async function listIssues(client, args) {
    const { owner, repo } = args;
    const issues = await client.get(`/repos/${owner}/${repo}/issues`, {
        type: args.type,
        state: args.state ?? "open",
        labels: args.labels,
        page: args.page ?? 1,
        limit: args.limit ?? 10,
    });
    if (!issues || issues.length === 0) {
        return `No issues found in ${owner}/${repo}.`;
    }
    return `Found ${issues.length} issue(s) in ${owner}/${repo}:\n\n${issues.map(formatIssue).join("\n\n")}`;
}
async function getIssue(client, args) {
    const { owner, repo, index } = args;
    const issue = await client.get(`/repos/${owner}/${repo}/issues/${index}`);
    return formatIssue(issue);
}
async function createIssue(client, args) {
    const { owner, repo, title, body, assignees, labels, milestone } = args;
    const issue = await client.post(`/repos/${owner}/${repo}/issues`, {
        title,
        body,
        assignees,
        labels,
        milestone,
    });
    return `Issue created successfully:\n\n${formatIssue(issue)}`;
}
async function editIssue(client, args) {
    const { owner, repo, index, ...fields } = args;
    const issue = await client.patch(`/repos/${owner}/${repo}/issues/${index}`, fields);
    return `Issue updated successfully:\n\n${formatIssue(issue)}`;
}
async function listIssueComments(client, args) {
    const { owner, repo, index } = args;
    const comments = await client.get(`/repos/${owner}/${repo}/issues/${index}/comments`, {
        page: args.page ?? 1,
        limit: args.limit ?? 10,
    });
    if (!comments || comments.length === 0) {
        return `No comments on issue #${index} in ${owner}/${repo}.`;
    }
    return `${comments.length} comment(s) on issue #${index}:\n\n${comments.map(formatComment).join("\n\n")}`;
}
async function createComment(client, args) {
    const { owner, repo, index, body } = args;
    const comment = await client.post(`/repos/${owner}/${repo}/issues/${index}/comments`, { body });
    return `Comment posted successfully:\n\n${formatComment(comment)}`;
}
async function searchRepos(client, args) {
    const result = await client.get("/repos/search", {
        q: args.q,
        topic: args.topic,
        include_desc: args.include_desc,
        owner: args.owner,
        is_private: args.is_private,
        archived: args.archived,
        page: args.page ?? 1,
        limit: args.limit ?? 10,
    });
    const repos = result?.data ?? [];
    if (repos.length === 0) {
        return "No repositories found.";
    }
    return `Found ${repos.length} repository/repositories:\n\n${repos.map(formatRepo).join("\n\n")}`;
}
async function getRepo(client, args) {
    const { owner, repo } = args;
    const repository = await client.get(`/repos/${owner}/${repo}`);
    return formatRepo(repository);
}
async function getUser(client) {
    const user = await client.get("/user");
    return [
        `Login: ${user.login}`,
        `Full name: ${user.full_name || "(not set)"}`,
        `Email: ${user.email || "(not set)"}`,
        `Admin: ${user.is_admin ?? false}`,
        `Profile: ${user.html_url}`,
        `Avatar: ${user.avatar_url}`,
    ].join("\n");
}
async function getUserInfo(client, args) {
    const { username } = args;
    const user = await client.get(`/users/${username}`);
    return [
        `Login: ${user.login}`,
        `Full name: ${user.full_name || "(not set)"}`,
        `Email: ${user.email || "(not set)"}`,
        `Profile: ${user.html_url}`,
        `Avatar: ${user.avatar_url}`,
    ].join("\n");
}
// ---------------------------------------------------------------------------
// Pull Request implementations
// ---------------------------------------------------------------------------
async function listPullRequests(client, args) {
    const { owner, repo } = args;
    const pulls = await client.get(`/repos/${owner}/${repo}/pulls`, {
        state: args.state ?? "open",
        sort: args.sort,
        labels: args.labels,
        milestone: args.milestone,
        page: args.page ?? 1,
        limit: args.limit ?? 10,
    });
    if (!pulls || pulls.length === 0) {
        return `No pull requests found in ${owner}/${repo}.`;
    }
    return `Found ${pulls.length} pull request(s) in ${owner}/${repo}:\n\n${pulls.map(formatPullRequest).join("\n\n")}`;
}
async function getPullRequest(client, args) {
    const { owner, repo, index } = args;
    const pr = await client.get(`/repos/${owner}/${repo}/pulls/${index}`);
    return formatPullRequest(pr);
}
async function createPullRequest(client, args) {
    const { owner, repo, title, body, head, base, assignees, labels, milestone } = args;
    const pr = await client.post(`/repos/${owner}/${repo}/pulls`, {
        title,
        body,
        head,
        base,
        assignees,
        labels,
        milestone,
    });
    return `Pull request created successfully:\n\n${formatPullRequest(pr)}`;
}
async function editPullRequest(client, args) {
    const { owner, repo, index, ...fields } = args;
    const pr = await client.patch(`/repos/${owner}/${repo}/pulls/${index}`, fields);
    return `Pull request updated successfully:\n\n${formatPullRequest(pr)}`;
}
async function mergePullRequest(client, args) {
    const { owner, repo, index, Do, merge_commit_id, merge_message_field, delete_branch_after_merge, force_merge, head_commit_id, merge_when_checks_succeed, } = args;
    await client.post(`/repos/${owner}/${repo}/pulls/${index}/merge`, {
        Do,
        merge_commit_id,
        merge_message_field,
        delete_branch_after_merge,
        force_merge,
        head_commit_id,
        merge_when_checks_succeed,
    });
    return `Pull request #${index} in ${owner}/${repo} merged successfully using '${Do}' method.`;
}
async function getPullRequestDiff(client, args) {
    const { owner, repo, index } = args;
    const diff = await client.getRaw(`/repos/${owner}/${repo}/pulls/${index}.diff`);
    if (!diff || diff.trim().length === 0) {
        return `No diff found for pull request #${index} in ${owner}/${repo}.`;
    }
    return diff;
}
async function getPullRequestFiles(client, args) {
    const { owner, repo, index } = args;
    const files = await client.get(`/repos/${owner}/${repo}/pulls/${index}/files`, {
        skip: args.skip,
        limit: args.limit ?? 10,
    });
    if (!files || files.length === 0) {
        return `No changed files in pull request #${index} in ${owner}/${repo}.`;
    }
    return `${files.length} changed file(s) in PR #${index}:\n\n${files.map(formatChangedFile).join("\n\n")}`;
}
async function listPullRequestReviews(client, args) {
    const { owner, repo, index } = args;
    const reviews = await client.get(`/repos/${owner}/${repo}/pulls/${index}/reviews`, {
        page: args.page ?? 1,
        limit: args.limit ?? 10,
    });
    if (!reviews || reviews.length === 0) {
        return `No reviews on pull request #${index} in ${owner}/${repo}.`;
    }
    return `${reviews.length} review(s) on PR #${index}:\n\n${reviews.map(formatReview).join("\n\n")}`;
}
async function createPullRequestReview(client, args) {
    const { owner, repo, index, event, body, commit_id, comments } = args;
    const review = await client.post(`/repos/${owner}/${repo}/pulls/${index}/reviews`, { body, event, commit_id, comments });
    return `Review created successfully:\n\n${formatReview(review)}`;
}
async function getPullRequestReview(client, args) {
    const { owner, repo, index, review_id } = args;
    const review = await client.get(`/repos/${owner}/${repo}/pulls/${index}/reviews/${review_id}`);
    return formatReview(review);
}
async function submitPullRequestReview(client, args) {
    const { owner, repo, index, review_id, event, body } = args;
    const review = await client.post(`/repos/${owner}/${repo}/pulls/${index}/reviews/${review_id}`, { body, event });
    return `Review submitted successfully:\n\n${formatReview(review)}`;
}
async function deletePullRequestReview(client, args) {
    const { owner, repo, index, review_id } = args;
    await client.delete(`/repos/${owner}/${repo}/pulls/${index}/reviews/${review_id}`);
    return `Review #${review_id} on PR #${index} in ${owner}/${repo} deleted successfully.`;
}
async function dismissPullRequestReview(client, args) {
    const { owner, repo, index, review_id, message } = args;
    const review = await client.post(`/repos/${owner}/${repo}/pulls/${index}/reviews/${review_id}/dismissals`, { message });
    return `Review dismissed successfully:\n\n${formatReview(review)}`;
}
function formatReviewComment(comment) {
    return [
        `Comment #${comment.id} by ${comment.user.login} on ${comment.path}`,
        comment.position !== undefined ? `  Line: ${comment.position}` : "",
        `  Body: ${comment.body}`,
        comment.diff_hunk ? `  Diff hunk:\n${comment.diff_hunk}` : "",
        `  Created: ${comment.created_at}`,
        `  URL: ${comment.html_url}`,
    ]
        .filter(Boolean)
        .join("\n");
}
async function getPullRequestReviewComments(client, args) {
    const { owner, repo, index, review_id } = args;
    const comments = await client.get(`/repos/${owner}/${repo}/pulls/${index}/reviews/${review_id}/comments`);
    if (!comments || comments.length === 0) {
        return `No comments on review #${review_id} for PR #${index} in ${owner}/${repo}.`;
    }
    return `${comments.length} comment(s) on review #${review_id}:\n\n${comments.map(formatReviewComment).join("\n\n")}`;
}
async function updatePullRequestBranch(client, args) {
    const { owner, repo, index, style } = args;
    await client.post(`/repos/${owner}/${repo}/pulls/${index}/update`, {
        style,
    });
    return `Pull request #${index} branch in ${owner}/${repo} updated successfully.`;
}
async function listNotifications(client, args) {
    const notifications = await client.get("/notifications", {
        all: args.all,
        since: args.since,
        before: args.before,
        page: args.page ?? 1,
        limit: args.limit ?? 10,
    });
    if (!notifications || notifications.length === 0) {
        return "No notifications found.";
    }
    return `${notifications.length} notification(s):\n\n${notifications.map(formatNotification).join("\n\n")}`;
}
async function markNotificationRead(client, args) {
    const id = args.id;
    await client.patch(`/notifications/threads/${id}`, undefined, { "to-status": "read" });
    return `Notification thread ${id} marked as read.`;
}
async function markAllNotificationsRead(client, args) {
    const params = {
        "to-status": "read",
    };
    if (args.last_read_at) {
        params.last_read_at = args.last_read_at;
    }
    await client.put("/notifications", undefined, params);
    return "All notifications marked as read.";
}
//# sourceMappingURL=handlers.js.map