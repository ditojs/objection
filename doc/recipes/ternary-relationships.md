# Ternary relationships

Assume we have the following Models:

1. user `(id, first_name, last_name)`
1. group `(id, name)`
1. permission `(id, label)`
1. user_group_permission `(user_id, group_id, permission_id, extra_attribute)`

Here's how you could create your models:

```js
// User.js
import { Model } from 'objection';
import Group from './Group.js';
import Permission from './Permission.js';

class User extends Model {
  static get tableName() {
    return 'user';
  }

  static get relationMappings() {
    return {
      groups: {
        relation: Model.ManyToManyRelation,
        modelClass: Group,
        join: {
          from: 'user.id',
          through: {
            from: 'user_group_permission.user_id',
            extra: ['extra_attribute'],
            to: 'user_group_permission.group_id'
          },
          to: 'group.id'
        }
      },

      permissions: {
        relation: Model.ManyToManyRelation,
        modelClass: Permission,
        join: {
          from: 'user.id',
          through: {
            from: 'user_group_permission.user_id',
            extra: ['extra_attribute'],
            to: 'user_group_permission.permission_id'
          },
          to: 'permission.id'
        }
      }
    };
  }
}

export default User;
```

```js
// Group.js
import { Model } from 'objection';
import User from './User.js';
import Permission from './Permission.js';

class Group extends Model {
  static get tableName() {
    return 'group';
  }

  static get relationMappings() {
    return {
      users: {
        relation: Model.ManyToManyRelation,
        modelClass: User,
        join: {
          from: 'group.id',
          through: {
            from: 'user_group_permission.group_id',
            extra: ['extra_attribute'],
            to: 'user_group_permission.user_id'
          },
          to: 'user.id'
        }
      },

      permissions: {
        relation: Model.ManyToManyRelation,
        modelClass: Permission,
        join: {
          from: 'group.id',
          through: {
            from: 'user_group_permission.group_id',
            extra: ['extra_attribute'],
            to: 'user_group_permission.permission_id'
          },
          to: 'permission.id'
        }
      }
    };
  }
}

export default Group;
```

```js
// Permission.js
import { Model } from 'objection';
import User from './User.js';
import Group from './Group.js';

class Permission extends Model {
  static get tableName() {
    return 'permission';
  }

  static get relationMappings() {
    return {
      users: {
        relation: Model.ManyToManyRelation,
        modelClass: User,
        join: {
          from: 'permission.id',
          through: {
            from: 'user_group_permission.permission_id',
            extra: ['extra_attribute'],
            to: 'user_group_permission.user_id'
          },
          to: 'user.id'
        }
      },

      groups: {
        relation: Model.ManyToManyRelation,
        modelClass: Group,
        join: {
          from: 'permission.id',
          through: {
            from: 'user_group_permission.permission_id',
            extra: ['extra_attribute'],
            to: 'user_group_permission.group_id'
          },
          to: 'group.id'
        }
      }
    };
  }
}

export default Permission;
```

```js
// UserGroupPermission.js
import { Model } from 'objection';
import User from './User.js';
import Group from './Group.js';
import Permission from './Permission.js';

class UserGroupPermission extends Model {
  static get tableName() {
    return 'user_group_permission';
  }

  static get idColumn() {
    return ['user_id', 'group_id', 'permission_id'];
  }

  static get relationMappings() {
    return {
      user: {
        relation: Model.BelongsToOneRelation,
        modelClass: User,
        join: {
          from: 'user_group_permission.user_id',
          to: 'user.id'
        }
      },

      group: {
        relation: Model.BelongsToOneRelation,
        modelClass: Group,
        join: {
          from: 'user_group_permission.group_id',
          to: 'group.id'
        }
      },

      permission: {
        relation: Model.BelongsToOneRelation,
        modelClass: Permission,
        join: {
          from: 'user_group_permission.permission_id',
          to: 'permission.id'
        }
      }
    };
  }
}

export default UserGroupPermission;
```

Here's how you can query your models:

- `.*JoinRelated()`

```js
UserGroupPermission.query()
  .select('first_name', 'last_name', 'label', 'extra_attribute')
  .joinRelated('[user, permission]')
  .where('group_id', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
/*
{
  first_name: ... ,
  last_name: ... ,
  label: ... ,
  extra_attribute: ...
}
*/
```

- `.withGraphFetched()`

```js
UserGroupPermission.query()
  .withGraphFetched('[user, permission]')
  .where('group_id', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
/*
{
  user: {
    first_name: ... ,
    last_name: ...
  },
  group: {
    name: ...
  },
  permission: {
    label: ...
  },
  extra_attribute: ...
}
*/
```

Read more about ternary relationships on [this issue](https://github.com/Vincit/objection.js/issues/179).
