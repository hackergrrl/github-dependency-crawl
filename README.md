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

### crawl(ownerRepo, cb)

Asynchronously makes many GitHub API requests to crawl a given repository's
dependency graph, given by the string `ownerRepo` of the form `"owner/repo"`.

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


## Install

With [npm](https://npmjs.org/) installed, run

```
$ npm install github-dependency-crawl
```

## License

ISC

