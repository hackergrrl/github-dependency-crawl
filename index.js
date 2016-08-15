var request = require('request')
var urlMatch = require('url-regexp').match
var urlParse = require('url').parse

// TODO: separate GH requests from depgraph building
module.exports = function (repo, cb) {
  var url = 'https://api.github.com/repos/'

  // Match freeform repo string to a GH url
  // if (repo.match(/[A-Za-z0-9-]+\/[A-Za-z0-9-]+/)) {
  //   url += repo + '/issues'
  // } else {
  //   throw new Error('unrecognized repo format. expected: owner/repo')
  // }

  var graph = {}

  var body = JSON.parse(require('fs').readFileSync('random-ideas'))

  // var opts = {
  //   url: url,
  //   headers: {
  //     'User-Agent': 'curl/7.47.1'
  //   }
  // }
  // request(opts, function (err, res, body) {
  //   // Bogus response
  //   if (err || res.statusCode !== 200) {
  //     console.log(res)
  //     return cb(err || new Error('status code ' + res.statusCode))
  //   }

  //   // Parse JSON response
  //   try {
  //     body = JSON.parse(body)
  //   } catch (err) {
  //     return cb(err)
  //   }

  //   cb(null, addToGraph(graph, body))
  // })

  graph = flatMerge(graph, issuesToDependencyGraph(body))
  // console.log('graph', graph)

  cb(null, graph)
}

function issuesToDependencyGraph (issues) {
  "Given a list of GitHub API issues and returns a dep-graph with all newly discovered dependencies from the issues given."

  // Iterate over each GH API issue, extract its declared dependencies, and
  // return an array of objects, each of the form
  // {
  //   'noffle/ideas/1': [ 'ipfs/go-ipfs/123', 'ipfs/js-ipfs/99' ],
  //   ...
  // }
  issues = filterMap(issues, function (issue) {
    var deps = extractDependencyUrls(issue.body).map(dependencyUrlToCanonicalName)
    var name = dependencyUrlToCanonicalName(issue.url)
    // console.log(name, deps)
    var res = {}
    res[name] = deps
    return deps.length > 0 ? res : null
  })

  // Merge the individual issues together into a single object
  return issues
    .reduce(function (graph, issue) {
      var name = Object.keys(issue)[0]
      graph[name] = issue[name]
      return graph
    }, {})
}

// TODO: match against #123 instead of just a URL, which implies a same-repo issue dep
function extractDependencyUrls (string) {
  "Given a freeform multi-line string, extract all dependencies as URLs."

  // TODO: assumes \r\n newlines, which is correct *today*, but in THE FUTURE?
  // iterate over lines in the body
  return filterMap(string.split('\r\n'), function (line) {
    // match 'depends on' prefix
    if (line.match(/^Depends on http/)) {
      // extract url
      var urls = urlMatch(line)
      if (urls.length === 1) {
        return urls[0]
      }
    }
    return false
  })
}

function dependencyUrlToCanonicalName (url) {
  "Converts a GitHub URL to canonical :owner/:repo/:issue-num form, or null if no such form could be extracted."

  // "url": "https://api.github.com/repos/jbenet/random-ideas/issues/37",

  var parsed = urlParse(url)
  if (parsed && parsed.protocol && parsed.path) {
    var components = parsed.path.split('/')
    // https://www.github.com/OWNER/REPO/issues/NUM
    if (components.length === 5 && components[0] === '' && components[3] === 'issues') {
      return components[1] + '/' + components[2] + '/' + components[4]
    }
    // https://api.github.com/repos/OWNER/REPO/issues/NUM
    else if (components.length === 6 && components[1] === 'repos' && components[4] === 'issues') {
      return components[2] + '/' + components[3] + '/' + components[5]
    }
  }

  return null
}

function filterMap (list, func) {
  "Runs a mapping function 'func' over a list, filtering out elements that are mapped to a non-truthy value."

  return list.map(function (item) {
    return func(item)
  }).filter(function (item) {
    return item
  })
}

function flatMerge (a, b) {
  "Merge two objects together shallowly. On key conflicts, b wins."

  return Object.keys(b)
    .reduce(function (result, key) {
      result[key] = b[key]
      return result
    }, a)
}
