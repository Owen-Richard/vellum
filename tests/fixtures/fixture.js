let clicks = 0;
document.querySelector('#target').addEventListener('click', () => {
  document.querySelector('#click-count').textContent = `Host clicks: ${++clicks}`;
});
document.querySelector('#navigate').addEventListener('click', () => {
  history.pushState({}, '', location.pathname === '/other' ? '/fixture' : '/other');
});
