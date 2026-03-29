/**
 * Forgejo API type definitions used by the MCP tools.
 */
export interface Issue {
    id: number;
    number: number;
    title: string;
    body: string;
    state: string;
    html_url: string;
    created_at: string;
    updated_at: string;
    user: User;
    assignees: User[] | null;
    labels: Label[];
    milestone: Milestone | null;
    comments: number;
    pull_request?: {
        merged: boolean;
        merged_at: string | null;
    };
    repository?: Repository;
}
export interface User {
    id: number;
    login: string;
    full_name: string;
    email: string;
    avatar_url: string;
    html_url: string;
    is_admin?: boolean;
}
export interface Repository {
    id: number;
    name: string;
    full_name: string;
    description: string;
    private: boolean;
    fork: boolean;
    html_url: string;
    clone_url: string;
    ssh_url: string;
    stars_count: number;
    forks_count: number;
    open_issues_count: number;
    default_branch: string;
    created_at: string;
    updated_at: string;
    owner: User;
    archived: boolean;
    empty: boolean;
}
export interface Label {
    id: number;
    name: string;
    color: string;
    description: string;
    url: string;
}
export interface Milestone {
    id: number;
    title: string;
    description: string;
    state: string;
    open_issues: number;
    closed_issues: number;
    due_on: string | null;
}
export interface Comment {
    id: number;
    html_url: string;
    user: User;
    body: string;
    created_at: string;
    updated_at: string;
}
export interface Notification {
    id: number;
    repository: Repository;
    subject: {
        title: string;
        url: string;
        latest_comment_url: string;
        type: string;
        state: string;
    };
    unread: boolean;
    pinned: boolean;
    updated_at: string;
}
export interface PullRequest {
    id: number;
    number: number;
    title: string;
    body: string;
    state: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
    user: User;
    assignees: User[] | null;
    labels: Label[];
    milestone: Milestone | null;
    comments: number;
    head: PRBranchInfo;
    base: PRBranchInfo;
    merged: boolean;
    mergeable: boolean;
    merged_by: User | null;
    merge_base: string;
    merge_commit_sha: string | null;
    is_locked: boolean;
    allow_maintainer_edit: boolean;
    repository?: Repository;
}
export interface PRBranchInfo {
    label: string;
    ref: string;
    sha: string;
    repo_id: number;
    repo?: Repository;
}
export interface PullRequestReview {
    id: number;
    reviewer: User;
    state: string;
    body: string;
    html_url: string;
    submitted_at: string;
    commit_id: string;
}
export interface ChangedFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    html_url: string;
    contents_url: string;
    previous_filename?: string;
}
//# sourceMappingURL=types.d.ts.map