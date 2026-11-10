// CloudFront Function (viewer-request) do site estático: /sessao e /sessao/ viram
// /sessao/index.html, que é o arquivo que o `nuxt generate` grava. A query (?id=...)
// fica em request.querystring e não é tocada.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var last = uri.substring(uri.lastIndexOf('/') + 1);

  if (last === '') {
    request.uri = uri + 'index.html';
  } else if (last.indexOf('.') === -1) {
    request.uri = uri + '/index.html';
  }
  return request;
}
