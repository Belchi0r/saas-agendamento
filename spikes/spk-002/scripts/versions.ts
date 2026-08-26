import packageJson from "../package.json" with { type: "json" };

console.log(
  JSON.stringify(
    {
      node: process.version,
      packageManager: packageJson.packageManager,
      dependencies: packageJson.dependencies,
      devDependencies: packageJson.devDependencies,
    },
    null,
    2,
  ),
);
