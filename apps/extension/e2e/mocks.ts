// Stand-ins for Depop's and Poshmark's sell forms, built from the markup the
// live pages had in October 2026: the same ids, hooks and order of steps,
// with a few lines of script where the real pages have React and Vue.

export const DEPOP_FORM = `<!doctype html><html><body><main><form id="f">
  <div><input type="file" id="upload-input__input" multiple accept="image/jpeg, image/png" /><div id="thumbs"></div></div>
  <label for="description">Description</label><textarea id="description"></textarea>
  <div id="combos"></div>
  <label for="priceAmount__input">Item price</label><input type="number" id="priceAmount__input" />
  <input type="checkbox" name="isInternationalShippingEnabled" />
  <button type="submit">Post</button>
  <button type="submit">Save as a draft</button>
</form></main>
<script>
  window.picked = {};
  const C = {
    group: { label: 'Category', search: true, groups: { 'MEN > COATS AND JACKETS': ['Jackets', 'Coats'], 'WOMEN > COATS AND JACKETS': ['Jackets'] } },
    brand: { label: 'Brand', search: true, options: ['Gap', 'Gap Factory', 'BabyGap'] },
    condition: { label: 'Condition', options: ['Brand new', 'Like new', 'Used - Excellent', 'Used - Good', 'Used - Fair'] },
    colour: { label: 'Color', multi: 2, options: ['Black', 'Brown', 'Tan', 'Multi'] },
    source: { label: 'Source', multi: 2, options: ['Vintage', 'Preloved', 'Deadstock'] },
    age: { label: 'Age', multi: 1, options: ['Modern', '00s', '90s'] },
    style: { label: 'Style', multi: 3, options: ['Streetwear', 'Casual', 'Utility', 'Retro'] },
    shippingMethods: { label: 'Package size', options: ['Large\\n\\nUnder 2lb', 'Medium\\n\\nUnder 1lb', 'Extra large\\n\\nUnder 10lb'], value: 'Large' },
  };
  function combo(name, def, before) {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<label for="' + name + '-input">' + def.label + '</label><div class="chips"></div>' +
      '<input id="' + name + '-input" role="combobox" aria-expanded="false" /><button type="button" id="' + name + '-toggle-button">v</button>' +
      '<ul id="' + name + '-menu" role="listbox"></ul>';
    (before ? document.getElementById('combos').insertBefore(wrap, before) : document.getElementById('combos').append(wrap));
    const input = wrap.querySelector('input'), menu = wrap.querySelector('ul'), chips = wrap.querySelector('.chips');
    window.picked[name] = def.multi ? [] : def.value || null;
    if (def.value) input.value = def.value;
    const render = filter => {
      menu.innerHTML = '';
      const add = (parent, text) => {
        const li = document.createElement('li'); li.setAttribute('role', 'option'); li.innerText = text; li.style.display = 'block';
        li.addEventListener('click', () => pick(text.split('\\n')[0])); parent.append(li);
      };
      if (def.groups) for (const [heading, opts] of Object.entries(def.groups)) {
        const hits = opts.filter(o => !filter || o.toLowerCase().includes(filter.toLowerCase()));
        if (!hits.length) continue;
        const block = document.createElement('div'); block.innerHTML = '<p>' + heading + '</p>'; menu.append(block);
        for (const o of hits) add(block, o);
      } else for (const o of def.options) if (!filter || o.toLowerCase().includes(filter.toLowerCase())) add(menu, o);
      input.setAttribute('aria-expanded', 'true');
    };
    const close = () => { menu.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); };
    const pick = value => {
      if (def.multi) {
        if (window.picked[name].length >= def.multi) return;
        window.picked[name].push(value);
        const chip = document.createElement('button'); chip.type = 'button'; chip.setAttribute('aria-label', 'Remove ' + value); chip.textContent = value + ' x';
        chip.addEventListener('click', () => { window.picked[name] = window.picked[name].filter(v => v !== value); chip.remove(); });
        chips.append(chip);
      } else { window.picked[name] = value; input.value = value; close(); }
      if (name === 'group') onCategory();
    };
    wrap.querySelector('button').addEventListener('click', () => (input.getAttribute('aria-expanded') === 'true' ? close() : render('')));
    input.addEventListener('input', () => (def.search ? render(input.value) : null));
    input.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    return wrap;
  }
  const brandWrap = (() => { let w; for (const [n, d] of Object.entries(C)) { const x = combo(n, d); if (n === 'brand') w = x; } return w; })();
  // Depop guesses a colour from the photos.
  document.querySelector('#colour-menu').parentElement.querySelector('button').click();
  [...document.querySelectorAll('#colour-menu [role=option]')].find(o => o.innerText === 'Multi').click();
  document.querySelector('#colour-toggle-button').click();
  function onCategory() {
    if (document.getElementById('variants-input')) return;
    combo('variants', { label: 'Size', options: ['XS', 'S', 'M', 'L', 'XL'] }, brandWrap);
  }
  document.getElementById('upload-input__input').addEventListener('change', e => {
    for (const f of e.target.files) { const img = document.createElement('img'); img.style.cssText = 'display:block;width:40px;height:40px'; document.getElementById('thumbs').append(img); }
    e.target.value = '';
  });
  document.getElementById('f').addEventListener('submit', e => {
    e.preventDefault();
    if (e.submitter && e.submitter.textContent !== 'Post') return;
    window.submitted = { picked: window.picked, price: document.getElementById('priceAmount__input').value,
      description: document.getElementById('description').value, worldwide: document.querySelector('[name=isInternationalShippingEnabled]').checked,
      photos: document.querySelectorAll('#thumbs img').length };
    history.pushState({}, '', '/products/seller-gap-jacket-1234/');
  });
</script></body></html>`;

export const POSHMARK_FORM = `<!doctype html><html><body>
<div class="listing-editor__section">
  <div class="listing-editor__subsection">PHOTOS
    <div data-et-name="listingEditorImageSection"><input type="file" id="img-file-input" multiple accept=".mov, .mp4, .png, .jpg, .jpeg" /><div id="thumbs"></div></div>
    <div class="image-edit-modal" style="display:none"><div class="modal"><button data-et-name="apply">Apply</button></div></div>
  </div>
</div>
<div class="listing-editor__subsection">TITLE <input data-vv-name="title" /></div>
<div class="listing-editor__subsection">DESCRIPTION <textarea data-vv-name="description"></textarea></div>
<div class="listing-editor__subsection">CATEGORY *
  <div class="listing-editor__category-container"><div class="dropdown"><div class="dropdown__selector">Select Category</div><div class="menu"></div></div></div>
  <div class="listing-editor__subcategory-container"><div class="dropdown"><div class="dropdown__selector">Select Subcategory (optional)</div><ul class="menu"></ul></div></div>
</div>
<div class="listing-editor__subsection">SIZE <div class="dropdown"><div class="dropdown__selector">Select Size</div><div class="menu"></div></div></div>
<div class="listing-editor__subsection">CONDITION <div class="listing-editor__condition-container"><div class="dropdown"><div class="dropdown__selector">Select Condition</div><ul class="dropdown__menu menu"></ul></div></div></div>
<div class="listing-editor__subsection">BRAND <input placeholder="Enter the Brand/Designer" /></div>
<div class="listing-editor__subsection">COLOR <div class="dropdown"><div class="dropdown__selector">Select up to 2 colors</div><div class="menu"></div></div></div>
<div class="listing-editor__subsection">STYLE TAGS <div class="tags"></div><input data-vv-name="style-tag-input" /><div class="suggest"></div></div>
<div class="listing-editor__subsection">PRICE <input data-vv-name="originalPrice" readonly /><input data-vv-name="listingPrice" readonly /></div>
<div id="price-modal" class="modal" style="display:none"><input id="listing-price-modal-listing-price-input" /><input id="listing-price-modal-original-price-input" /><button>Done</button></div>
<button data-et-name="next">Next</button>
<div id="share" style="display:none"><button data-et-name="list">List This Item</button></div>
<script>
  window.state = { tags: [], colors: [] };
  const $ = s => document.querySelector(s);
  const sec = n => [...document.querySelectorAll('.listing-editor__subsection')].find(s => s.innerText.trim().toUpperCase().startsWith(n));
  const li = (text, onClick, withA) => { const l = document.createElement('li'); l.innerHTML = withA ? '<a>' + text + '</a>' : '<div>' + text + '</div>'; l.addEventListener('click', onClick); return l; };
  $('#img-file-input').addEventListener('change', e => {
    window.state.photos = e.target.files.length;
    $('.image-edit-modal').style.display = 'block';
  });
  $('[data-et-name=apply]').addEventListener('click', () => {
    $('.image-edit-modal').style.display = 'none';
    for (let i = 0; i < window.state.photos; i++) { const img = document.createElement('img'); img.style.cssText = 'display:block;width:30px;height:30px'; $('#thumbs').append(img); }
  });
  const CATS = { men: ['Jackets & Coats', 'Shirts', 'Sweaters'], women: ['Tops', 'Jackets & Coats'] };
  const SUBS = { 'Jackets & Coats': ['Bomber & Varsity', 'Lightweight & Shirt Jackets', 'Puffers', 'None'] };
  const catBox = $('.listing-editor__category-container');
  catBox.querySelector('.dropdown__selector').addEventListener('click', () => {
    const m = catBox.querySelector('.menu');
    m.innerHTML = '<ul><li><a data-et-name="all">All Categories</a></li><li><a data-et-name="women">Women</a></li><li><a data-et-name="men">Men</a></li></ul>';
    for (const a of m.querySelectorAll('a')) a.addEventListener('click', () => {
      const dept = a.dataset.etName;
      const list = document.createElement('ul');
      for (const c of CATS[dept] || []) list.append(li(c, () => { window.state.category = dept + '/' + c; catBox.querySelector('.dropdown__selector').innerText = c; m.innerHTML = ''; }));
      m.append(list);
    });
  });
  const subBox = $('.listing-editor__subcategory-container');
  subBox.querySelector('.dropdown__selector').addEventListener('click', () => {
    const m = subBox.querySelector('.menu'); m.innerHTML = '';
    for (const s of SUBS[(window.state.category || '').split('/')[1]] || []) m.append(li(s, () => { window.state.subcategory = s; m.innerHTML = ''; }, true));
  });
  const size = sec('SIZE');
  size.querySelector('.dropdown__selector').addEventListener('click', () => {
    const m = size.querySelector('.menu'); m.innerHTML = '<ul></ul>';
    for (const s of ['XS', 'S', 'M', 'L', 'XL']) { const l = document.createElement('li'); const b = document.createElement('button'); b.textContent = s; b.addEventListener('click', () => { window.state.size = s; m.innerHTML = ''; }); l.append(b); m.firstChild.append(l); }
  });
  const cond = $('.listing-editor__condition-container');
  cond.querySelector('.dropdown__selector').addEventListener('click', () => {
    const m = cond.querySelector('ul'); m.innerHTML = '';
    for (const c of ['New With Tags (NWT)\\nBrand new', 'Like New\\nUsed once', 'Good\\nGently used', 'Fair\\nWorn']) m.append(li(c.replace('\\n', '<br>'), () => { window.state.condition = c.split('\\n')[0]; m.innerHTML = ''; }));
  });
  const color = sec('COLOR');
  color.querySelector('.dropdown__selector').addEventListener('click', () => {
    const m = color.querySelector('.menu'); m.innerHTML = '<ul></ul>';
    for (const c of ['Black', 'Brown', 'Tan']) { const l = document.createElement('li'); l.className = 'listing-editor__tile--color'; l.innerHTML = '<a></a><span>' + c + '</span>'; l.querySelector('a').addEventListener('click', () => window.state.colors.push(c)); m.firstChild.append(l); }
    const done = document.createElement('button'); done.textContent = 'Done'; done.addEventListener('click', () => (m.innerHTML = '')); m.append(done);
  });
  const tags = sec('STYLE TAGS'); const tagInput = tags.querySelector('input');
  const addTag = t => { if (window.state.tags.length < 3) { window.state.tags.push(t); const d = document.createElement('div'); d.className = 'listing-editor__tag__div'; d.textContent = t; tags.querySelector('.tags').append(d); } };
  tagInput.addEventListener('click', () => {
    const s = tags.querySelector('.suggest'); s.innerHTML = '';
    for (const t of ['90s', 'Workwear', 'Casual']) { const d = document.createElement('div'); d.dataset.etName = t; d.textContent = t; d.addEventListener('click', () => addTag(t)); s.append(d); }
  });
  tagInput.addEventListener('keydown', e => { if (e.key === 'Enter' && tagInput.value) { addTag(tagInput.value); tagInput.value = ''; } });
  $('[data-vv-name=listingPrice]').addEventListener('click', () => ($('#price-modal').style.display = 'block'));
  $('#price-modal button').addEventListener('click', () => {
    $('[data-vv-name=listingPrice]').value = $('#listing-price-modal-listing-price-input').value;
    $('[data-vv-name=originalPrice]').value = $('#listing-price-modal-original-price-input').value;
    $('#price-modal').style.display = 'none';
  });
  $('[data-et-name=next]').addEventListener('click', () => { if ($('[data-vv-name=listingPrice]').value) $('#share').style.display = 'block'; });
  $('[data-et-name=list]').addEventListener('click', () => {
    window.state.title = $('[data-vv-name=title]').value; window.state.price = $('[data-vv-name=listingPrice]').value;
    window.state.brand = $('[placeholder="Enter the Brand/Designer"]').value; window.listed = window.state;
    history.pushState({}, '', '/listing/GAP-Jacket-65a1b2c3');
  });
</script></body></html>`;
