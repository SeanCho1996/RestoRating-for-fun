document.addEventListener('click', (event) => {
  const card = event.target.closest('.tier-restaurant[data-map-url]');
  if (!card || event.target.closest('button, a, [data-edit], [data-delete]')) return;
  window.open(card.dataset.mapUrl, '_blank', 'noopener,noreferrer');
});

document.addEventListener('keydown', (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const card = event.target.closest('.tier-restaurant[data-map-url]');
  if (!card || event.target.closest('button, a')) return;
  event.preventDefault();
  window.open(card.dataset.mapUrl, '_blank', 'noopener,noreferrer');
});
