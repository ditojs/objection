import { raw, ref, PartialModelRow, Transaction } from 'objection';
import { User, Organization, Project, Task, AuditLog } from './models.js';

export async function listUsers(orgId: number, page: number) {
  return User.query()
    .active()
    .where('organizationId', orgId)
    .select('id', 'email', 'firstName', 'lastName')
    .orderBy('lastName')
    .page(page, 20);
}

export async function getUser(id: number) {
  const user = await User.query().findById(id).withGraphFetched('[organization, profile]');
  if (user) {
    user.organization.name;
    user.profile?.bio;
  }
  return user;
}

export async function getUserOrFail(id: number) {
  return User.query().findById(id).throwIfNotFound();
}

export async function findByEmail(email: string) {
  return User.query().where('email', email).first();
}

export async function findAdmins(orgId: number) {
  return User.query()
    .where({ organizationId: orgId, role: 'admin' })
    .whereNotNull('lastLoginAt')
    .orderBy('lastLoginAt', 'desc')
    .limit(10);
}

export async function searchUsers(term: string) {
  return User.query()
    .active()
    .where((qb) =>
      qb.where('firstName', 'like', `%${term}%`).orWhere('lastName', 'like', `%${term}%`),
    )
    .orderBy([{ column: 'lastName' }, { column: 'firstName', order: 'asc' }])
    .limit(50);
}

export async function usersWithProjects(orgId: number) {
  const users = await User.query()
    .where('organizationId', orgId)
    .withGraphFetched('projects.[tasks, milestones]')
    .orderBy('id');
  return users.map((u) => u.projects.map((p) => p.tasks.length + p.milestones.length));
}

export async function usersJoinedOrganization(slug: string) {
  return User.query()
    .joinRelated('organization')
    .where('organization.slug', slug)
    .select('users.*');
}

export async function countUsers(orgId: number) {
  const result = await User.query().where('organizationId', orgId).resultSize();
  return result;
}

export async function updateUser(id: number, data: PartialModelRow<User>) {
  return User.query().patchAndFetchById(id, data);
}

export async function renameUser(id: number, firstName: string) {
  const n = await User.query().patch({ firstName }).where('id', id);
  return n;
}

export async function touchLogin(id: number) {
  return User.query().findById(id).patch({ lastLoginAt: new Date() });
}

export async function deactivate(ids: number[]) {
  return User.query().whereIn('id', ids).patch({ deletedAt: new Date() });
}

export async function deleteUser(id: number) {
  return User.query().deleteById(id);
}

export async function createUser(orgId: number, email: string) {
  return User.query().insert({
    organizationId: orgId,
    email,
    firstName: 'New',
    lastName: 'User',
    role: 'member',
    lastLoginAt: null,
    settings: { theme: 'light', locale: 'en' },
    deletedAt: null,
  });
}

export async function createUserWithProfile(orgId: number, email: string) {
  return User.query().insertGraph({
    organizationId: orgId,
    email,
    firstName: 'New',
    lastName: 'User',
    role: 'member',
    profile: { bio: 'hi', avatarUrl: null },
  });
}

export async function upsertUser(user: User) {
  return User.query().upsertGraph({ id: user.id, firstName: user.firstName }, { relate: true });
}

export async function userProjects(user: User) {
  return user.$relatedQuery('projects').where('status', 'active').orderBy('name');
}

export async function userManager(user: User) {
  return user.$relatedQuery('manager');
}

export async function relateProject(user: User, projectId: number) {
  return user.$relatedQuery('projects').relate(projectId);
}

export async function unrelateProject(user: User, projectId: number) {
  return user.$relatedQuery('projects').unrelate().where('projects.id', projectId);
}

export async function reportsOf(managerId: number) {
  return User.relatedQuery('reports').for(managerId).orderBy('lastName');
}

export async function userTaskStats(orgId: number) {
  return User.query()
    .where('organizationId', orgId)
    .select('users.id')
    .count('assignedTasks.id as taskCount')
    .leftJoinRelated('assignedTasks')
    .groupBy('users.id')
    .having(raw('count(??)', 'assignedTasks.id'), '>', 5);
}

export async function usersInTx(trx: Transaction) {
  const users = await User.query(trx).active().newest().limit(5);
  const org = await Organization.query(trx).findById(users[0].organizationId);
  return org;
}

export async function fetchGraphForUsers(users: User[]) {
  const fetched = await User.fetchGraph(users, '[organization, manager.profile]');
  return fetched.map((u) => u.organization.name);
}

export async function userWithFetchGraph(user: User) {
  const u = await user.$fetchGraph('assignedTasks.comments');
  return u.assignedTasks.flatMap((t) => t.comments);
}

export async function usersByRef() {
  return User.query().where(ref('settings:theme').castText(), 'dark').select('id');
}

export async function logAction(userId: number, action: string) {
  return AuditLog.query().insert({ userId, action, payload: {}, createdAt: new Date() });
}

export async function recentLogs(userId: number) {
  return AuditLog.query()
    .where('userId', userId)
    .withGraphFetched('user.organization')
    .orderBy('createdAt', 'desc')
    .limit(20);
}

export async function usersWithOpenTasks() {
  return User.query()
    .whereExists(User.relatedQuery('assignedTasks').where('done', false))
    .select('id', 'email');
}

export async function userProjectNames(userId: number) {
  return Project.query()
    .joinRelated('members')
    .where('members.id', userId)
    .distinct('projects.name')
    .orderBy('projects.name');
}

export async function userTasksSubquery(userId: number) {
  return Task.query()
    .whereIn(
      'projectId',
      Project.query().select('id').joinRelated('members').where('members.id', userId),
    )
    .orderBy('priority', 'desc');
}
