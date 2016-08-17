var request = require('request')
var urlMatch = require('url-regexp').match
var urlParse = require('url').parse
var asyncReduce = require('async').reduce

// TODO: consider using a github api module instead of http api directly


module.exports = function (opts, cb) {

  if (typeof opts === 'string') {
    opts = { repo: opts }
  }

  if (!opts.repo) {
    throw new Error('missing first param "repo"')
  }

  // Validate the repo
  var components = opts.repo.split('/')
  if (components.length !== 2 && components.length !== 1) {
    throw new Error('malformed input; expected :org/:repo or :org')
  }

  opts.orgToRepos = opts.orgToRepos || orgToRepos
  opts.repoToGitHubIssues = opts.repoToGitHubIssues || orgRepoToGitHubIssues
  opts.issueToGitHubIssue = opts.issueToGitHubIssue || issueToGitHubIssue

  // Recurse on org or repo
  var numComponents = opts.repo.split('/').length
  if (numComponents === 1) {
    recursiveOrgNameToDependencyGraph(opts.repo, cb)
  } else if (numComponents === 2) {
    recursiveRepoNameToDependencyGraph(opts.repo, {}, cb)
  } else {
    throw new Error('repo must be "org" or "org/repo"')
  }

  function recursiveOrgNameToDependencyGraph (org, cb) {
    "Asynchronously gets all issues from all GitHub repos of a GitHub organization and follows all out-of-repo links recursively, returning a full dependency graph for that organization."

    // Get all repos in the org
    orgToRepos(org, function (err, repos) {
      // console.log('got all repos', repos.length)

      asyncReduce(repos, {},
        function reduce (graph, repo, callback) {
          recursiveRepoNameToDependencyGraph(repo, {}, function (err, graph2) {
            if (err) return callback(err)
            // console.log('  got repo', repo)
            callback(null, flatMerge(graph, graph2))
          })
        },
        function done (err, res) {
          if (err) return cb(err)
          cb(null, res)
        })
    })
  }

  function recursiveRepoNameToDependencyGraph (repo, graph, cb) {
    "Asynchronously gets all issues from a GitHub repo and follows all out-of-repo links recursively, returning a full dependency graph for that repo."

    orgRepoToDependencyGraph(repo, function (err, graph2) {
      if (err) return cb(err)

      // console.log('repo ->', graph2)

      graph = flatMerge(graph, graph2)

      recursiveResolveGraph(graph, cb)
    })
  }

  function recursiveResolveGraph (graph, cb) {
    "Asynchronously takes a partially resolved graph and looks up unresolved dependencies against GitHub until all are satisfied."

    var unresolved = getUnresolvedDependencies(graph)
    // console.log('unres', unresolved)

    // Base case; all is resolved already
    if (!unresolved.length) {
      return cb(null, graph)
    }

    // TODO: a possible optimization might be to check if there are e.g. > N
    // unresolved dependencies for a single :org/:repo tuple, and just do a
    // fetch of that repo's full issue set, filtering out what's not needed.
    asyncReduce(unresolved, graph,
      function reduce (graph, issue, callback) {
        // console.log('issue ->', issue)
        issueToDependencyGraph(issue, function (err, innerGraph) {
          // console.log('flatMerge', graph, innerGraph)
          callback(null, flatMerge(graph, innerGraph))
        })
      },
      function done (err, res) {
        if (err) return cb(err)
        recursiveResolveGraph(res, cb)
      })
  }

  function orgRepoToDependencyGraph (orgRepo, cb) {
    "Given a GitHub repo of the form ':org/:repo', returns a dependency graph."

    opts.repoToGitHubIssues(orgRepo, function (err, issues) {
      if (err) return cb(err)
      cb(null, githubIssuesToDependencyGraph(issues))
    })
  }


  function issueToDependencyGraph (issue, cb) {
    "Given an issue of the form ':org/:repo/:issue-num', returns a list of issues and their declared dependencies."

    opts.issueToGitHubIssue(issue, function (err, res) {
      if (err) return cb(err)

      var graph = githubIssuesToDependencyGraph([res])

      // Deal with the case that we were redirected, lest infinite loops occur.
      // e.g. We ask for ipfs/ipget/1 but results refer to noffle/ipget/1
      var name = dependencyUrlToCanonicalName(res.url)
      if (name !== issue) {
        replaceInGraph(graph, name, issue)
      }

      cb(null, graph)
    })
  }

  function orgRepoToGitHubIssues (orgRepo, cb) {
    "Given a string of the form :org/:repo, asynchronously retrives a list of GitHub API issues. Recursively steps through all pages of issues."

    var url = 'https://api.github.com/repos/'

    // Match freeform repo string to a GH url
    if (orgRepo.match(/[A-Za-z0-9-]+\/[A-Za-z0-9-]+/)) {
      url += orgRepo + '/issues'
    } else {
      throw new Error('unrecognized repo format. expected: org/repo')
    }

    // Get all issues (not just open ones).
    url += "?state=all"

    fetchIssuesPage(url, [], cb)


    function fetchIssuesPage (url, issuesAccum, cb) {
      "Recursively fetches subsequent pages of GitHub issues via the GitHub API."

      var ropts = {
        url: url,
        headers: {
          'User-Agent': userAgent()
        }
      }
      if (opts.auth && opts.auth.client_id && opts.auth.client_secret) {
        ropts.url += '&client_id=' + opts.auth.client_id
        ropts.url += '&client_secret=' + opts.auth.client_secret
      }
      // console.error('request:', ropts.url)
      request(ropts, function (err, res, body) {
        // Bogus response
        if (err || res.statusCode !== 200) {
          // console.log(res)
          return cb(err || new Error('status code ' + res.statusCode))
        }

        // Parse JSON response
        try {
          body = JSON.parse(body)
        } catch (err) {
          return cb(err)
        }

        // console.log('    got issues', body.length)

        issuesAccum = issuesAccum.concat(body)

        // Recursive pagination, or terminate
        if (res.headers['link']) {
          var links = parseLinkHeader(res.headers['link'])
          if (links['next']) {
            return fetchIssuesPage(links['next'], issuesAccum, cb)
          }
        }

        // Fall-through base case: no more pages
        // console.log('accum', issuesAccum)
        cb(null, issuesAccum)
      })
    }
  }

  function orgToRepos (org, cb) {
    "Given a string of the form :org, retrieve a list of GitHub repo names."

    var url = 'https://api.github.com/orgs/' + org + '/repos'

    // Only grab repos the org actually 'owns'.
    url += '?type=source'

    fetchReposPage(url, [], cb)

    function fetchReposPage (url, reposAccum, cb) {
      "Recursively fetches subsequent pages of GitHub repos via the GitHub API."

      var ropts = {
        url: url,
        headers: {
          'User-Agent': userAgent()
        }
      }
      if (opts.auth && opts.auth.client_id && opts.auth.client_secret) {
        ropts.url += '&client_id=' + opts.auth.client_id
        ropts.url += '&client_secret=' + opts.auth.client_secret
      }
      // console.error('request:', ropts.url)
      request(ropts, function (err, res, body) {
        // Bogus response
        if (err || res.statusCode !== 200) {
          return cb(err || new Error('status code ' + res.statusCode))
        }

        // Parse JSON response
        try {
          body = JSON.parse(body)
        } catch (err) {
          return cb(err)
        }

        // Map results to canonical :org/:repo names
        body = body.map(function (repo) {
          return repo.full_name
        })

        reposAccum = reposAccum.concat(body)

        // Recursive pagination, or terminate
        if (res.headers['link']) {
          var links = parseLinkHeader(res.headers['link'])
          if (links['next']) {
            return fetchReposPage(links['next'], reposAccum, cb)
          }
        }

        // Fall-through base case: no more pages
        // console.log('accum', reposAccum)
        cb(null, reposAccum)
      })
    }
  }

  function issueToGitHubIssue (issue, cb) {
    "Given a string of the form :org/:repo/:issue, asynchronously retrieves the corresponding GitHub API issue."

    // Validate the input
    var components = issue.split('/')
    if (components.length !== 3) {
      throw new Error('malformed input; expected :org/:repo/:issue-num')
    }

    var org = components[0]
    var repo = components[1]
    var issueNum = components[2]

    // Retrieve the issue
    var ropts = {
      url: 'https://api.github.com/repos/' + org + '/' + repo + '/issues/' + issueNum,
      headers: {
        'User-Agent': userAgent()
      }
    }
    if (opts.auth && opts.auth.client_id && opts.auth.client_secret) {
      ropts.url += '&client_id=' + opts.auth.client_id
      ropts.url += '&client_secret=' + opts.auth.client_secret
    }
    // console.error('request:', opts.url)
    request(ropts, function (err, res, body) {
      // Bogus response
      if (err || res.statusCode !== 200) {
        // console.log(res)
        return cb(err || new Error('status code ' + res.statusCode))
      }

      // Parse JSON response
      try {
        body = JSON.parse(body)
      } catch (err) {
        return cb(err)
      }

      cb(null, body)
    })
  }
}

function githubIssuesToDependencyGraph (issues) {
  "Given a list of GitHub API issues and returns a dep-graph with all newly discovered dependencies from the issues given."

  // Iterate over each GH API issue, extract its declared dependencies, and
  // return an array of objects, each of the form
  // {
  //   'noffle/ideas/1': [ 'ipfs/go-ipfs/123', 'ipfs/js-ipfs/99' ],
  //   ...
  // }
  issues = filterMap(issues, function (issue) {
    var name = dependencyUrlToCanonicalName(issue.url)
    var orgRepo = name.split('/').slice(0, 2).join('/')
    var deps = filterMap(
      extractDependencyUrls(issue.body, orgRepo),
      dependencyUrlToCanonicalName)

    var res = {}
    res[name] = deps
    return res
  })

  // Merge the individual issues together into a single object
  return issues
    .reduce(function (graph, issue) {
      var name = Object.keys(issue)[0]
      graph[name] = issue[name]
      return graph
    }, {})
}

function getUnresolvedDependencies (graph) {
  "Finds all issues that are referenced by the graph but not contained in it."

  return Object.keys(graph)
    .reduce(function (issues, key) {
      // all referenced deps that don't exist in the graph
      var unresolved = graph[key].filter(function (d) {
        return graph[d] === undefined
      })

      return issues.concat(unresolved)
    }, [])
}

function extractDependencyUrls (string, orgRepo) {
  "Given a freeform multi-line string, extract all dependencies as URLs. If an optional 'orgRepo' string is given (e.g. noffle/latest-tweets), dependency strings of the form 'Depends on #24' can be resolved to the current repo."

  if (!string) {
    return []
  }

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
    } else if (orgRepo && line.match(/^Depends on #(\d+)/)) {
      // extract issue-num
      var issueNum = line.match(/^Depends on #(\d+)/)[1]
      return 'https://github.com/' + orgRepo + '/issues/' + issueNum
    }
    return false
  })
}

function dependencyUrlToCanonicalName (url) {
  "Converts a GitHub URL to canonical :org/:repo/:issue-num form, or null if no such form could be extracted."

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

function userAgent () {
  "Produces a User-Agent string using the package's name and version, of the form NAME/VERSION."

  var package = require(require('path').join(__dirname, 'package.json'))
  return package.name + '/' + package.version
}

function replaceInGraph (graph, from, to) {
  "In-place graph mutation, where all instances of 'from' are replaced with 'to'."

  Object.keys(graph)
    .forEach(function (key) {
      // replace top-level key
      if (key === from) {
        graph[to] = graph[from]
        delete graph[from]
        key = to
      }

      // replace occurrences in dependencies
      graph[key] = graph[key].map(function (dep) {
        return (dep === from) ? to : dep
      })
    })
}

function parseLinkHeader (header) {
  `Given a GitHub 'Link' header string, parses it and returns an object mapping
  'rel' names to URLs.

  '<https://api.github.com/repositories/20312497/issues?page=2>; rel="next", <https://api.github.com/repositories/20312497/issues?page=10>; rel="last"'

  would map to

  {
    "next": "https://api.github.com/repositories/20312497/issues?page=2"
    "last": "https://api.github.com/repositories/20312497/issues?page=10"
  }
  `

  var res = {}

  var regex = /<(.*?)>; rel="(\w+)"/
  var match
  while (match = header.match(regex)) {
    var url = match[1]
    var name = match[2]
    res[name] = url
    header = header.substring(match[0].length)
  }

  return res
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
