# github-dependency-crawl

> Crawl GitHub issues to build a dependency graph.


## Usage

Let's see what this very repository's dependency tree looks like:

```js
var crawl = require('github-dependency-crawl')

crawl('noffle/github-dependency-crawl', function (err, graph) {
  console.log(graph)
})
```

It'll look something like this:

```
{
  'noffle/github-dependency-crawl/2': [ 'noffle/github-dependency-crawl/3' ],
  'noffle/github-dependency-crawl/1': [ 'noffle/github-dependency-crawl/2', 'noffle/github-dependency-crawl/3' ],
  'noffle/github-dependency-crawl/3': [ 'noffle/ipget/18' ],
  'noffle/ipget/18': [ 'ipfs/ipget/24', 'ipfs/ipget/26', 'ipfs/ipget/20', 'ipfs/ipget/21' ],
  'ipfs/ipget/24': [],
  'ipfs/ipget/26': [],
  'ipfs/ipget/20': [],
  'ipfs/ipget/21': []
}
```

Where keys indicate issues in the graph, and each maps to a list of its
dependencies.

## API

```js
var crawl = require('github-dependency-crawl')
```

### crawl(opts, cb)

Asynchronously makes many GitHub API requests to crawl a given repository's
dependency graph.

To simply get the dependency graph of a repo, `opts` can be a string of the form
`"owner/repo"`.

`cb` is of the form `function (err, graph)`. `graph` contains an object of the
form

```js
{
  issueName: [ issueName ],
  issueName: [ issueName ],
  ...
}
```

where `issueName` is of the form `owner/repo/issue-num` (e.g.
`noffle/latest-tweets/1`).

Keys are entries in the dependency graph, and the issues it maps to are its
dependencies.

For more flexible use, `opts` can be an object of the form

```js
{
  repo: 'owner/repo',
  orgToRepos: function (orgName, cb) { ... },
  repoToGitHubIssues: function (repoName, cb) { ... },
  issueToGitHubIssues: function (issueName, cb) { ... },
  auth: {
    client_id: '...',
    client_secret: '...'
  }
}
```

`repoName` will be of the form `owner/repo` and `issueName` of the form
`owner/repo/issue-num`.

`auth` provides the option to include GitHub API credentials, to be able to make
a higher # requests / hour.

By default, the crawler will visit all pages of issues per-repo.

If not supplied, `orgToRepos`, `repoToGitHubIssues` and `issueToGitHubIssues`
will default to the built-in functionality of querying the GitHub API. These
functions are overwritable here so that the module can a) be easily unit tested,
and b) you can crawl your own offline datasets by e.g. substituting github api
requests for local filesystem reads.


## Install

With [npm](https://npmjs.org/) installed, run

```
$ npm install github-dependency-crawl
```

## License

ISC

