import { raw, ref, PartialModelRow, QueryBuilder } from 'objection';
import { Task, Comment, Attachment, User, Tag, Project } from './models.js';

export async function openTasks(projectId: number) {
  return Task.query().where({ projectId, done: false }).orderBy('priority', 'desc');
}

export async function myTasks(user: User) {
  return user
    .$relatedQuery('assignedTasks')
    .where('done', false)
    .withGraphFetched('[project, milestone]');
}

export async function taskDetail(id: number) {
  const task = await Task.query()
    .findById(id)
    .withGraphFetched(
      '[project.organization, assignee.profile, comments.[author, attachments], tags]',
    )
    .throwIfNotFound();
  return {
    org: task.project.organization.name,
    assignee: task.assignee?.profile?.bio,
    comments: task.comments.map((c) => c.author.email + c.attachments.length),
    tags: task.tags.map((t) => t.color),
  };
}

export async function completeTask(id: number) {
  return Task.query().patchAndFetchById(id, { done: true });
}

export async function reassign(taskIds: number[], assigneeId: number | null) {
  return Task.query().patch({ assigneeId }).whereIn('id', taskIds);
}

export async function bumpPriority(projectId: number) {
  return Task.query().where('projectId', projectId).increment('priority', 1);
}

export async function createTask(projectId: number, title: string) {
  return Task.query().insert({
    projectId,
    title,
    done: false,
    priority: 0,
    milestoneId: null,
    assigneeId: null,
    estimate: null,
    deletedAt: null,
  });
}

export async function createTasks(projectId: number, titles: string[]) {
  return Task.query().insert(
    titles.map((title) => ({ projectId, title, done: false, priority: 0 })),
  );
}

export async function createTaskWithComment(projectId: number, authorId: number) {
  return Task.query().insertGraphAndFetch({
    projectId,
    title: 'with comment',
    done: false,
    priority: 1,
    comments: [{ authorId, body: 'first', attachments: [{ fileName: 'a.png', size: 10 }] }],
  });
}

export async function addComment(task: Task, authorId: number, body: string) {
  return task.$relatedQuery('comments').insert({ authorId, body });
}

export async function taskComments(taskId: number) {
  return Comment.query().where('taskId', taskId).withGraphFetched('author').orderBy('createdAt');
}

export async function commentPage(taskId: number, page: number) {
  return Comment.query().where('taskId', taskId).newest().page(page, 50);
}

export async function deleteComment(id: number) {
  return Comment.query().deleteById(id);
}

export async function editComment(id: number, body: string) {
  return Comment.query().findById(id).patch({ body });
}

export async function bigAttachments(min: number) {
  return Attachment.query().where('size', '>', min).orderBy('size', 'desc').limit(100);
}

export async function attachmentsOfTask(task: Task) {
  return task.$relatedQuery('attachments').select('fileName', 'size');
}

export async function overdue() {
  return Task.query()
    .joinRelated('milestone')
    .where('milestone.dueAt', '<', new Date())
    .where('tasks.done', false)
    .select('tasks.*');
}

export async function unassigned(projectId: number) {
  return Task.query().where('projectId', projectId).whereNull('assigneeId').orderBy('createdAt');
}

export async function estimateSum(projectId: number) {
  return Task.query().where('projectId', projectId).sum('estimate as total').first();
}

export async function taskTags(taskId: number) {
  return Task.relatedQuery('tags').for(taskId).orderBy('label');
}

export async function tagTask(task: Task, tagIds: number[]) {
  return task.$relatedQuery('tags').relate(tagIds);
}

export async function tasksWithTag(label: string) {
  return Task.query()
    .whereExists(Task.relatedQuery('tags').where('label', label))
    .withGraphFetched('tags')
    .orderBy('id');
}

export async function tasksByAssigneeOrg(orgId: number) {
  return Task.query()
    .joinRelated('assignee.organization')
    .where('assignee:organization.id', orgId)
    .select('tasks.*');
}

export async function rawWhere(projectId: number) {
  return Task.query().whereRaw('project_id = ? and done = ?', [projectId, false]).select('id');
}

export async function jsonQuery() {
  return User.query().whereJsonSupersetOf('settings', { theme: 'dark' }).select('id');
}

export async function taskUpdate(id: number, patch: PartialModelRow<Task>) {
  return Task.query().findById(id).patch(patch).returning('*');
}

export async function firstTaskOfProject(project: Project) {
  return project.$relatedQuery('tasks').orderBy('createdAt').first();
}

export async function tasksForUserIds(ids: number[]) {
  return Task.query()
    .whereIn('assigneeId', ids)
    .withGraphFetched('assignee(selectEmail)')
    .modifiers({
      selectEmail: (qb) => qb.select('id', 'email'),
    });
}

export async function tasksUnion(a: number, b: number) {
  return Task.query()
    .where('projectId', a)
    .union((qb) => qb.where('projectId', b))
    .orderBy('id');
}

export async function taskCounts(projectId: number) {
  return Task.query().where('projectId', projectId).select('done').count('* as n').groupBy('done');
}

export async function tasksAfterId(id: number) {
  return Task.query().where('id', '>', id).orderBy('id').limit(100).offset(0);
}

export async function upsertTaskGraph(task: Task) {
  return Task.query().upsertGraph({
    id: task.id,
    comments: [
      { id: 1, body: 'x' },
      { body: 'new', authorId: 1 },
    ],
  });
}

export function filterDone(qb: QueryBuilder<Task>) {
  return qb.where('done', true);
}

export async function doneTasks() {
  return Task.query().modify(filterDone).orderBy(ref('tasks.updatedAt'), 'desc');
}

export async function taskFetchGraph(task: Task) {
  const t = await Task.fetchGraph(task, 'comments.author');
  return t.comments.map((c) => c.author.firstName);
}

export async function attachmentOwnerComment(a: Attachment) {
  return a.$relatedQuery('comment').withGraphFetched('task');
}

export async function tagsWithCounts() {
  return Tag.query()
    .select('tags.*', Tag.relatedQuery('tasks').count().as('taskCount'))
    .orderBy(ref('taskCount'), 'desc');
}

export async function tasksForMilestones(ids: number[]) {
  return Task.query().whereIn('milestoneId', ids).where('done', false).first();
}

export async function updateTasksRaw(projectId: number) {
  return Task.query()
    .patch({ priority: raw('priority + 1') })
    .where('projectId', projectId);
}
