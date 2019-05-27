module.exports = {
  env: {
    node: true
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
