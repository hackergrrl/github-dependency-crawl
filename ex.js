var crawl = require('./index')

crawl('jbenet/random-ideas', function (err, graph) {
  if (err) return console.log(err)

  console.log(graph)
})


/*
{
  'ipfs/go-ipfs/123': [ 'ipfs/go-ipfs/19', 'ipfs/js-ipfs/27' ],
  ...
}
*/

