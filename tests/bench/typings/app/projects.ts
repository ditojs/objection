import { raw, ref, fn, Transaction, Page } from 'objection';
import { Project, Milestone, Task, Tag, Organization, User } from './models.js';
import { AppQueryBuilder } from './base.js';

export async function listProjects(orgId: number) {
  return Project.query().active().where('organizationId', orgId).orderBy('name');
}

export async function projectPage(orgId: number, page: number): Promise<Page<Project>> {
  return Project.query().where('organizationId', orgId).newest().page(page, 25);
}

export async function getProject(id: number) {
  return Project.query()
    .findById(id)
    .withGraphFetched('[organization, members, milestones.tasks, tags]')
    .throwIfNotFound();
}

export async function projectSummary(id: number) {
  const p = await getProject(id);
  return {
    org: p.organization.name,
    members: p.members.map((m) => m.email),
    tasks: p.milestones.reduce((n, m) => n + m.tasks.length, 0),
    tags: p.tags.map((t) => t.label),
  };
}

export async function projectsWithBudget(min: number, max: number) {
  return Project.query()
    .whereBetween('budget', [min, max])
    .where('status', 'active')
    .orderBy('budget', 'desc');
}

export async function archiveProject(id: number) {
  return Project.query().patch({ status: 'archived' }).findById(id);
}

export async function createProject(orgId: number, name: string) {
  return Project.query().insertAndFetch({
    organizationId: orgId,
    name,
    description: null,
    status: 'active',
    budget: 0,
    deletedAt: null,
  });
}

export async function createProjectGraph(orgId: number, name: string) {
  return Project.query().insertGraph(
    {
      organizationId: orgId,
      name,
      status: 'active',
      budget: 1000,
      milestones: [
        { title: 'M1', dueAt: null, tasks: [{ title: 'T1', done: false, priority: 1 }] },
        { title: 'M2', dueAt: new Date() },
      ],
      tags: [{ '#dbRef': 1 }],
    },
    { relate: ['tags'] },
  );
}

export async function projectMilestones(project: Project) {
  return project.$relatedQuery('milestones').orderBy('dueAt');
}

export async function projectTasks(projectId: number) {
  return Project.relatedQuery('tasks')
    .for(projectId)
    .where('done', false)
    .orderBy('priority', 'desc');
}

export async function nextMilestone(projectId: number) {
  return Milestone.query()
    .where('projectId', projectId)
    .whereNotNull('dueAt')
    .where('dueAt', '>', new Date())
    .orderBy('dueAt')
    .first();
}

export async function milestoneWithTasks(id: number) {
  const m = await Milestone.query().findById(id).withGraphJoined('[project, tasks.assignee]');
  return m?.tasks.map((t) => t.assignee?.email);
}

export async function tagProject(project: Project, tagId: number) {
  return project.$relatedQuery('tags').relate(tagId);
}

export async function untagProject(project: Project, tagId: number) {
  return project.$relatedQuery('tags').unrelate().where('tags.id', tagId);
}

export async function projectsByTag(label: string) {
  return Project.query().joinRelated('tags').where('tags.label', label).select('projects.*');
}

export async function projectsTaskCounts(orgId: number) {
  return Project.query()
    .where('organizationId', orgId)
    .select('projects.id', 'projects.name', Project.relatedQuery('tasks').count().as('taskCount'))
    .orderBy(ref('taskCount'), 'desc');
}

export async function budgetTotals() {
  return Project.query()
    .select('organizationId')
    .sum('budget as total')
    .groupBy('organizationId')
    .orderBy(ref('total'), 'desc');
}

export async function copyProject(id: number, trx: Transaction) {
  const source = await Project.query(trx)
    .findById(id)
    .withGraphFetched('milestones')
    .throwIfNotFound();
  return Project.query(trx).insertGraph({
    organizationId: source.organizationId,
    name: source.name + ' copy',
    status: 'active',
    budget: source.budget,
    milestones: source.milestones.map((m) => ({ title: m.title, dueAt: m.dueAt })),
  });
}

export async function deleteProject(id: number) {
  return Project.transaction(async (trx) => {
    await Task.query(trx).delete().where('projectId', id);
    await Milestone.query(trx).delete().where('projectId', id);
    return Project.query(trx).deleteById(id);
  });
}

export async function upsertProject(project: Project) {
  return Project.query().upsertGraphAndFetch(
    { id: project.id, name: project.name, milestones: [{ id: 1, title: 'X' }] },
    { noDelete: true },
  );
}

export function scoped(qb: AppQueryBuilder<Project>, orgId: number) {
  return qb.where('organizationId', orgId).active();
}

export async function scopedProjects(orgId: number) {
  return Project.query().modify(scoped, orgId).orderBy('name');
}

export async function orgsWithProjects() {
  const orgs = await Organization.query()
    .withGraphFetched('projects(onlyActive).tags')
    .modifiers({ onlyActive: (qb) => qb.where('status', 'active') });
  return orgs.map((o) => o.projects.map((p) => p.tags.length));
}

export async function orgUsersAndProjects(id: number) {
  const org = await Organization.query()
    .findById(id)
    .withGraphFetched({ users: true, projects: { tasks: true } });
  return org && org.users.length + org.projects.reduce((n, p) => n + p.tasks.length, 0);
}

export async function projectMembersSince(project: Project, since: Date) {
  return project.$relatedQuery('members').where('lastLoginAt', '>=', since).select('id', 'email');
}

export async function coalesceDescriptions() {
  return Project.query().select('id', fn.coalesce('description', raw('?', ['n/a'])).as('desc'));
}

export async function orgMembers(org: Organization) {
  return org.$relatedQuery('users').where('role', 'admin').first();
}

export async function lastProjectUpdate(orgId: number) {
  return Project.query().where('organizationId', orgId).max('updatedAt as last').first();
}

export async function idsOnly(orgId: number) {
  const rows = await Project.query().where('organizationId', orgId).select('id');
  return rows.map((r) => r.id);
}

export async function membersOfMany(ids: number[]) {
  return Project.relatedQuery('members').for(ids).distinct('users.id');
}

export async function findUserProjectsCount(user: User) {
  return user.$relatedQuery('projects').resultSize();
}
