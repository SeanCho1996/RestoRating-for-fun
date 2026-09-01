document.addEventListener('DOMContentLoaded', () => {
  const dialog = document.querySelector('#restaurantDialog');
  const form = document.querySelector('#restaurantForm');
  const input = form?.querySelector('input[type="file"]');
  const dropArea = form?.querySelector('.file-drop');
  const fileLabel = document.querySelector('#fileLabel');
  if (!dialog || !form || !input || !dropArea) return;

  const preview = document.createElement('img');
  preview.id = 'photoPreview';
  preview.className = 'photo-preview hidden';
  preview.alt = '餐厅照片预览';
  dropArea.insertAdjacentElement('afterend', preview);

  let objectUrl = null;
  let originalPhoto = null;

  function releaseObjectUrl() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }

  function showPreview(source, localFile = false) {
    releaseObjectUrl();
    objectUrl = localFile ? source : null;
    preview.src = source;
    preview.classList.remove('hidden');
  }

  function clearPreview() {
    releaseObjectUrl();
    preview.removeAttribute('src');
    preview.classList.add('hidden');
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('#addRestaurantButton')) {
      originalPhoto = null;
      clearPreview();
    }

    if (event.target.closest('[data-edit]')) {
      originalPhoto = event.target.closest('.restaurant-card')?.querySelector('.card-photo')?.getAttribute('src') || null;
      if (originalPhoto) showPreview(originalPhoto);
    }
  });

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) {
      originalPhoto ? showPreview(originalPhoto) : clearPreview();
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      input.value = '';
      fileLabel.textContent = '请选择 JPG、PNG、WebP 或 GIF 图片';
      originalPhoto ? showPreview(originalPhoto) : clearPreview();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      input.value = '';
      fileLabel.textContent = '图片不能超过 5MB';
      originalPhoto ? showPreview(originalPhoto) : clearPreview();
      return;
    }

    showPreview(URL.createObjectURL(file), true);
  });

  dialog.addEventListener('close', () => {
    originalPhoto = null;
    clearPreview();
  });
});
