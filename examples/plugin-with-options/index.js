'use strict';

// Objection.js plugins are class mixins. Read this excellent article for detailed description:
// http://justinfagnani.com/2015/12/21/real-mixins-with-javascript-classes/
//
// A plugin should be a function that takes a model class as an argument. A plugin then needs to
// extends that model and return it. A plugin should never modify the model directly!
//
// If the plugin takes options the main module should be a factory function that returns a
// mixin. This plugin is exactly the same as the `plugin` example, but adds a couple of options.
module.exports = (options) => {
  // Provide good defaults for the options if possible.
  options = {
    setModifiedBy: true,
    setModifiedAt: true,
    setCreatedBy: true,
    setCreatedAt: true,
    ...options,
  };

  // Return the mixin. If your plugin doesn't take options, you can simply export
  // the mixin. The factory function is not needed.
  return (Model) => {
    // If your plugin extends the QueryBuilder, you need to extend `Model.QueryBuilder`
    // since it may have already been extended by other plugins.
    class SessionQueryBuilder extends Model.QueryBuilder {
      // Add a custom method that stores a session object to the query context. In this example
      // plugin a session represents the logged-in user as in passport.js session.
      session(session) {
        // Save the session to the query context so that it will be available in all
        // queries created by this builder and also in the model hooks. `session` is
        // not a reserved word or some objection.js concept. You can store any data
        // to the query context.
        return this.context({ session });
      }
    }

    // A Plugin always needs to return the extended model class.
    //
    // IMPORTANT: Don't give a name for the returned class! This way the returned
    // class inherits the super class's name.
    return class extends Model {
      // Make our model use the extended QueryBuilder.
      static get QueryBuilder() {
        return SessionQueryBuilder;
      }

      async $beforeUpdate(opt, context) {
        // If you extend existing methods like this one, always remember to call the
        // super implementation. The hooks can be async, so always await the result.
        await super.$beforeUpdate(opt, context);

        if (context.session) {
          if (options.setModifiedAt) {
            this.modifiedAt = new Date().toISOString();
          }

          if (options.setModifiedBy) {
            this.modifiedBy = context.session.userId;
          }
        }
      }

      async $beforeInsert(context) {
        // If you extend existing methods like this one, always remember to call the
        // super implementation. The hooks can be async, so always await the result.
        await super.$beforeInsert(context);

        if (context.session) {
          if (options.setCreatedAt) {
            this.createdAt = new Date().toISOString();
          }

          if (options.setCreatedBy) {
            this.createdBy = context.session.userId;
          }
        }
      }
    };
  };
};
