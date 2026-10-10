// A small helper for lazy access to the JoinBuilder class, for modules that the
// JoinBuilder module imports itself. Importing JoinBuilder.js there would create
// a circular import, so JoinBuilder.js registers itself here instead.
let JoinBuilder;

export const getJoinBuilder = () => JoinBuilder;

export const setJoinBuilder = (joinBuilder) => {
  JoinBuilder = joinBuilder;
};
