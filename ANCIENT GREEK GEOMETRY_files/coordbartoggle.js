modules.coordbartoggle = (function() {
  'use stict';
  var coordbartoggle = {};
  var header = document.getElementById('coordheader');
  // var footer = document.getElementById('sidefooter');
  var items = document.getElementById('coordscroll');
  var hidden = false;
  var toggle = function() {
    hidden = !hidden;
    if (hidden) {
      items.style.display = 'none';
      header.style.borderBottom = 0;
    } else {
      items.style.display = 'block';
      header.style.borderBottom = '1px solid black';
    }
  };
  header.addEventListener('click', toggle);
  footer.addEventListener('click', toggle);
  return coordbartoggle;
}());
