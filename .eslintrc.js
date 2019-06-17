module.exports = {
  env: {
    node: true,
    es6: true
  },
  globals: {
    Event: false // readonly
  },
  parser: "babel-eslint",
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended",
    "plugin:import/errors",
    "plugin:import/warnings"
  ],
  plugins: ["module-resolver"],
  rules: {
    "prettier/prettier": "error",
    "module-resolver/use-alias": 2
  },
  settings: {
    "import/resolver": {
      "babel-module": {}
    }
  }
};
