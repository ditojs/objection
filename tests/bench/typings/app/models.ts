import { Model, TypedRelationMappings } from 'objection';
import { BaseModel } from './base.js';

export class Organization extends BaseModel {
  static tableName = 'organizations';
  name!: string;
  slug!: string;
  users?: User[];
  projects?: Project[];
  tags?: Tag[];

  static relationMappings = () =>
    ({
      users: {
        relation: Model.HasManyRelation,
        modelClass: User,
        join: { from: 'organizations.id', to: 'users.organizationId' },
      },
      projects: {
        relation: Model.HasManyRelation,
        modelClass: Project,
        join: { from: 'organizations.id', to: 'projects.organizationId' },
      },
      tags: {
        relation: Model.HasManyRelation,
        modelClass: Tag,
        join: { from: 'organizations.id', to: 'tags.organizationId' },
      },
    }) satisfies TypedRelationMappings<Organization>;
}

export class User extends BaseModel {
  static tableName = 'users';
  organizationId!: number;
  email!: string;
  firstName!: string;
  lastName!: string;
  role!: 'admin' | 'member' | 'guest';
  lastLoginAt!: Date | null;
  settings!: { theme: string; locale: string };
  organization?: Organization;
  profile?: Profile | null;
  projects?: Project[];
  assignedTasks?: Task[];
  comments?: Comment[];
  manager?: User | null;
  reports?: User[];

  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }

  static relationMappings = () =>
    ({
      organization: {
        relation: Model.BelongsToOneRelation,
        modelClass: Organization,
        join: { from: 'users.organizationId', to: 'organizations.id' },
      },
      profile: {
        relation: Model.HasOneRelation,
        modelClass: Profile,
        join: { from: 'users.id', to: 'profiles.userId' },
      },
      projects: {
        relation: Model.ManyToManyRelation,
        modelClass: Project,
        join: {
          from: 'users.id',
          through: { from: 'projectMembers.userId', to: 'projectMembers.projectId' },
          to: 'projects.id',
        },
      },
      assignedTasks: {
        relation: Model.HasManyRelation,
        modelClass: Task,
        join: { from: 'users.id', to: 'tasks.assigneeId' },
      },
      comments: {
        relation: Model.HasManyRelation,
        modelClass: Comment,
        join: { from: 'users.id', to: 'comments.authorId' },
      },
      manager: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: { from: 'users.managerId', to: 'users.id' },
      },
      reports: {
        relation: Model.HasManyRelation,
        modelClass: User,
        join: { from: 'users.id', to: 'users.managerId' },
      },
    }) satisfies TypedRelationMappings<User>;
}

export class Profile extends BaseModel {
  static tableName = 'profiles';
  userId!: number;
  bio!: string | null;
  avatarUrl!: string | null;
  user?: User;
}

export class Project extends BaseModel {
  static tableName = 'projects';
  organizationId!: number;
  name!: string;
  description!: string | null;
  status!: 'active' | 'archived';
  budget!: number;
  organization?: Organization;
  members?: User[];
  milestones?: Milestone[];
  tasks?: Task[];
  tags?: Tag[];
}

export class Milestone extends BaseModel {
  static tableName = 'milestones';
  projectId!: number;
  title!: string;
  dueAt!: Date | null;
  project?: Project;
  tasks?: Task[];
}

export class Task extends BaseModel {
  static tableName = 'tasks';
  projectId!: number;
  milestoneId!: number | null;
  assigneeId!: number | null;
  title!: string;
  done!: boolean;
  priority!: number;
  estimate!: number | null;
  project?: Project;
  milestone?: Milestone | null;
  assignee?: User | null;
  comments?: Comment[];
  attachments?: Attachment[];
  tags?: Tag[];
}

export class Comment extends BaseModel {
  static tableName = 'comments';
  taskId!: number;
  authorId!: number;
  body!: string;
  task?: Task;
  author?: User;
  attachments?: Attachment[];
}

export class Attachment extends BaseModel {
  static tableName = 'attachments';
  taskId!: number | null;
  commentId!: number | null;
  fileName!: string;
  size!: number;
  task?: Task | null;
  comment?: Comment | null;
}

export class Tag extends BaseModel {
  static tableName = 'tags';
  organizationId!: number;
  label!: string;
  color!: string;
  organization?: Organization;
  tasks?: Task[];
  projects?: Project[];
}

// A plain model without the custom query builder.
export class AuditLog extends Model {
  static tableName = 'auditLogs';
  id!: number;
  userId!: number | null;
  action!: string;
  payload!: object;
  createdAt!: Date;
  user?: User | null;
}
