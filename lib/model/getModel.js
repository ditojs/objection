// A small helper for lazy access to the Model class, for modules that the Model
// module imports itself. Importing Model.js there would create a circular import,
// so Model.js registers itself here instead.
let Model;

const getModel = () => Model;

const setModel = (model) => {
  Model = model;
};

export { getModel, setModel };
