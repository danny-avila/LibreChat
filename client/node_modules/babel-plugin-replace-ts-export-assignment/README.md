# babel-plugin-replace-ts-export-assignment

Allows [export assignment](https://www.typescriptlang.org/docs/handbook/modules.html#export--and-import--require) syntax to be used 
when compiling TypeScript with `@babel/preset-typescript`.

This works by simply replacing `export =` with `module.exports`, to keep CJS semantics.

## Contributing

The most important thing when contributing is to make sure to add information about changes to the `CHANGELOG.md`,
ideally before publishing a new version. If you're not confident doing this, just ensure you provide primary maintainers
as much information as possible, particular about any special rules or gotchas that are a result of your change.

#### Linting

To run `eslint` on the project, run:

```
npm run lint
```

#### Testing

To run `jest` on the project, run:

```
npm run test
```

#### Checking

To check that the project is type safe, run:

```
npm run check
```

#### Building

To compile the project using `TypeScript`, run:

```
npm run build
```

#### Changelog

This package uses a `CHANGELOG.md` to track, note, and describe changes to its surface.

All documentable changes should be, being placed under the appropriate header in the `CHANGELOG`.

Note that the `CHANGELOG` is *not* fixed - it's perfectly reasonable to edit it after the fact, for whatever reason.

The version headers of the `CHANGELOG` are automated by an `npm-version` script, located in the `scripts` folder,
When run, the script will insert a new version header below the `[Unreleased]` header.

The version header is enclosed in a link, linking to the comparing page for the repo
(to allow users to easily bring up a full git comparision between the new & previous versions of the package),
 and has the date of the release at the end.

#### Tagging, Versioning, & Publishing

We use [SemVer](http://semver.org/) for versioning.

Tags should match the release versions, with a prefixing `v`

Both publishing & versioning should be done using `npm`, which'll also handle tags.

To publish a new version of this package, use `npm publish`.

There is an `npm-version` script located in the `scripts` folder of the repo,
that handles keeping the `CHANGELOG` headers in sync with new package versions.
