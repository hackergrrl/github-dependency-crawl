var crawl = require('./index')

var opts = {
  repo: 'ipfs/js-ipfs',
  // auth: {
  //   client_id: '',
  //   client_secret: ''
  // }
}

// crawl('jbenet/random-ideas', function (err, graph) {
// crawl('noffle/github-dependency-crawl', function (err, graph) {
crawl(opts, function (err, graph) {
  if (err) return console.log(err)

  console.log(graph)
})


/*
 * returns an object with keys denoting issues that map to a list of its dependencies
{
  'ipfs/go-ipfs/123': [ 'ipfs/go-ipfs/19', 'ipfs/js-ipfs/27' ],
  ...
}
*/

