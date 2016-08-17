var crawl = require('../index')
var test = require('tape')

test('basic', function (t) {
  t.plan(1)

  var opts = {
    repo: 'noffle/github-dependency-crawl',
    repoToGitHubIssues: function (ownerRepo, cb) {
      process.nextTick(function () {
        if (ownerRepo === opts.repo) {
          return cb(null, [
            {
              url: 'https://github.com/noffle/github-dependency-crawl/issues/1',
              body: 'Depends on https://github.com/noffle/talks/issues/13'
            }
          ])
        } else {
          cb(null, [])
        }
      })
    },
    issueToGitHubIssue: function (issue, cb) {
      process.nextTick(function () {
        if (issue === 'noffle/talks/13') {
          return cb(null, {
              url: 'https://github.com/noffle/talks/issues/13',
              body: 'hi friends'
            })
        } else {
          cb(null, [])
        }
      })
    }
  }

  crawl(opts, function (err, graph) {
    if (err) t.fail(err)

    t.deepEqual(graph, {
      'noffle/github-dependency-crawl/1': [ 'noffle/talks/13' ],
      'noffle/talks/13': []
    })
  })
})

test('url inputs', function (t) {
  t.plan(4)

  // no-op transforms
  var opts = {
    orgToRepos: function (org, cb) {
      process.nextTick(function () {
        cb(null, [])
      })
    },
    repoToGitHubIssues: function (ownerRepo, cb) {
      process.nextTick(function () {
        cb(null, [])
      })
    },
    issueToGitHubIssue: function (issue, cb) {
      process.nextTick(function () {
        cb(null, [])
      })
    }
  }

  function fail () { t.fail("shouldn't hit callback") }

  // org + repo
  opts.repo = 'https://github.com/noffle/github-dependency-crawl'
  crawl(opts, function (err, res) {
    t.equal(err, null)
  })

  // just an org
  opts.repo = 'https://github.com/noffle'
  crawl(opts, function (err, res) {
    t.equal(err, null)
  })

  // not github.com
  opts.repo = 'http://github.org/noffle'
  try {
    crawl(opts, fail)
  } catch (e) {
    t.pass()
  }

  // no issue support yet
  opts.repo = 'http://github.com/noffle/bananas/issues/9'
  try {
    crawl(opts, fail)
  } catch (e) {
    t.pass()
  }
})

