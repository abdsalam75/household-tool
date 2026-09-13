import js from "@eslint/js";
import react from "eslint-plugin-react";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/", ".expo/", "coverage/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: {
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
      },
    },
    plugins: {
      react,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
);
