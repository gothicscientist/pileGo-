// Stand-ins for Depop's and Poshmark's sell forms, built from the markup the
// live pages had in October 2026: the same ids, hooks and order of steps,
// with a few lines of script where the real pages have React and Vue.

export const DEPOP_FORM = `<!doctype html><html><body><main><form id="f">
  <div><input type="file" id="upload-input__input" multiple accept="image/jpeg, image/png" /><div id="thumbs"></div></div>
  <label for="description">Description</label><textarea id="description"></textarea>
  <div id="combos"></div>
  <label for="priceAmount__input">Item price</label><input type="number" id="priceAmount__input" />
  <input type="checkbox" name="isInternationalShippingEnabled" />
  <div id="intl" style="display:none"><label for="internationalShippingCost__input">International shipping</label><input type="number" id="internationalShippingCost__input" /></div>
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
      // Depop sometimes opens a menu before its options arrive.
      if (def.emptyFirst && !def.shown) { def.shown = true; input.setAttribute('aria-expanded', 'true'); return; }
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
      } else {
        window.picked[name] = value; input.value = value;
        if (name === 'variants' && window.slowSizeClose) {
          // The reducer closes first; React updates aria-expanded later.
          menu.innerHTML = '';
          setTimeout(() => input.setAttribute('aria-expanded', 'false'), 1000);
        } else close();
        if (name === 'variants' && window.replaceSizeInput) {
          // React remounts the field while preserving its selected value.
          const replacement = input.cloneNode(true); replacement.value = value;
          input.replaceWith(replacement); input.value = '';
        }
      }
      if (name === 'group') onCategory();
    };
    wrap.querySelector('button').addEventListener('click', () => (input.getAttribute('aria-expanded') === 'true' ? close() : render('')));
    input.addEventListener('input', () => (def.search ? render(input.value) : null));
    input.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (name === 'variants' && window.slowSizeClose && window.picked[name]) {
        // Downshift clears selectedItem on Escape when already closed.
        document.querySelector('main').innerHTML = '<h2>Something went wrong</h2>500 Internal Server Error';
        throw new TypeError("Cannot destructure property 'value' of 'object null' as it is null.");
      }
      close();
    });
    return wrap;
  }
  const brandWrap = (() => { let w; for (const [n, d] of Object.entries(C)) { const x = combo(n, d); if (n === 'brand') w = x; } return w; })();
  // Depop guesses a colour from the photos.
  document.querySelector('#colour-menu').parentElement.querySelector('button').click();
  [...document.querySelectorAll('#colour-menu [role=option]')].find(o => o.innerText === 'Multi').click();
  document.querySelector('#colour-toggle-button').click();
  function onCategory() {
    if (document.getElementById('variants-input')) return;
    combo('variants', { label: 'Size', options: ['XS', 'S', 'M', 'L', 'XL'], emptyFirst: true }, brandWrap);
  }
  document.getElementById('upload-input__input').addEventListener('change', e => {
    for (const f of e.target.files) { const img = document.createElement('img'); img.style.cssText = 'display:block;width:40px;height:40px'; document.getElementById('thumbs').append(img); }
    e.target.value = '';
  });
  // Worldwide shipping brings up an international price; the server falls over without one.
  const worldwide = document.querySelector('[name=isInternationalShippingEnabled]');
  const intl = document.getElementById('internationalShippingCost__input');
  worldwide.addEventListener('change', () => (document.getElementById('intl').style.display = worldwide.checked ? 'block' : 'none'));
  window.posts = 0;
  document.getElementById('f').addEventListener('submit', e => {
    e.preventDefault();
    if (e.submitter && e.submitter.textContent !== 'Post') return;
    window.posts += 1;
    if (worldwide.checked && !intl.value) {
      const t = document.createElement('div'); t.setAttribute('role', 'alert'); t.textContent = 'Request failed with status code 500';
      document.querySelector('main').append(t);
      return;
    }
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

/**
 * Mercari's sell form as of October 2026, with the hooks the driver uses. The
 * seller has no saved address yet, so Ships from is empty until one is added.
 */
export const MERCARI_FORM = `<!doctype html><html><body>
<div role="dialog" data-testid="DialogWrapper" id="welcome"><p>Why not earn some extra $$$?</p><button data-testid="NewListerDialogCreateOwn" type="submit">Create a listing</button></div>
<main>
  <input data-testid="SellPhotoInput" type="file" multiple accept="image/*" /><div id="thumbs"></div>
  <input data-testid="Title" id="sellName" name="sellName" />
  <textarea data-testid="Description" name="sellDescription"></textarea>
  <button data-testid="SellCategoryFieldButton" type="button">Select category</button>
  <div><input data-testid="Brand" id="sellBrandId" aria-haspopup="listbox" /><ul id="sellBrandOptions" role="listbox"></ul></div>
  <div id="sellCondition"><div role="radiogroup" aria-label="Condition"></div></div>
  <div id="sizebox"></div>
  <div data-testid="ShipsFrom">Ships from: <span id="zip"></span></div><button data-testid="ShipsFromEditButton" type="submit">Edit</button>
  <input data-testid="SelectShipping" readonly value="" />
  <div aria-haspopup="listbox" id="ShippingPayerOption" data-testid="ShippingPayerOption" tabindex="0">Yes (Recommended)</div>
  <input data-testid="Price" name="sellPrice" />
  <button data-testid="SmartPricingButton" role="button" aria-pressed="true" type="submit">ON</button>
  <button data-testid="ListButton" type="submit">List</button>
</main>
<script>
  window.state = {};
  const $ = s => document.querySelector(s);
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  $('[data-testid=NewListerDialogCreateOwn]').addEventListener('click', () => $('#welcome').remove());
  $('[data-testid=SellPhotoInput]').addEventListener('change', e => {
    for (const f of e.target.files) { const img = document.createElement('img'); img.alt = 'thumbnail'; img.style.cssText = 'display:block;width:20px;height:20px'; $('#thumbs').append(img); }
  });
  const TREE = { Women: { 'Tops & blouses': ['T-shirts', 'Other'] }, Men: { Tops: ['Button-front', 'T-shirts', 'Other'], Jeans: ['Other'] }, Kids: {} };
  let path = [];
  function dialog() {
    let d = $('#catdialog');
    if (!d) { d = el('<div role="dialog" data-testid="DialogWrapper" id="catdialog"><button aria-label="Close">x</button><div data-testid="CategoryDialogBody"><button aria-label="Back">&lt;</button><div id="rows"></div></div></div>'); document.body.append(d);
      d.querySelector('[aria-label=Close]').addEventListener('click', () => d.remove());
      d.querySelector('[aria-label=Back]').addEventListener('click', () => { path.pop(); draw(); }); }
    draw();
  }
  function draw() {
    const rows = $('#rows'); rows.innerHTML = '';
    let node = TREE; for (const p of path) node = node[p];
    const names = Array.isArray(node) ? [...node, 'All ' + path[1]] : Object.keys(node);
    for (const n of names) { const b = el('<button data-testid="CategoryRow"></button>'); b.textContent = n; rows.append(b);
      b.addEventListener('click', () => {
        if (Array.isArray(node)) { const chosen = n.startsWith('All ') ? path.join(' > ') : [...path, n].join(' > '); window.state.category = chosen; $('[data-testid=SellCategoryFieldButton]').textContent = chosen; $('#catdialog').remove(); sizes(); quote(); }
        else { path.push(n); draw(); }
      }); }
  }
  $('[data-testid=SellCategoryFieldButton]').addEventListener('click', dialog);
  const BRANDS = ['Carhartt', 'Carhartt WIP', 'Carrhart', '3M', 'Adidas'];
  const brand = $('[data-testid=Brand]');
  const brandList = (q) => { const ul = $('#sellBrandOptions'); ul.innerHTML = ''; BRANDS.filter(b => !q || b.toLowerCase().includes(q.toLowerCase())).forEach((b, i) => {
    const li = el('<li role="option"></li>'); li.id = 'sellBrandOptions-' + i; li.textContent = b; li.addEventListener('click', () => { brand.value = b; window.state.brand = b; ul.innerHTML = ''; }); ul.append(li); }); };
  brand.addEventListener('focus', () => brandList(''));
  brand.addEventListener('input', () => setTimeout(() => brandList(brand.value), 300));
  ['New', 'Like new', 'Good', 'Fair', 'Poor'].forEach((c, i) => { const l = el('<label><input type="radio" name="_r_0_" value="' + (i + 1) + '"><b>' + c + '</b><br><span>details</span></label>'); l.querySelector('input').addEventListener('change', () => (window.state.condition = c)); $('[aria-label=Condition]').append(l); });
  function sizes() {
    $('#sizebox').innerHTML = '<input data-testid="Size" id="itemSizeId" aria-haspopup="listbox"><ul id="itemSizeId" role="listbox"></ul>';
    const s = $('#sizebox input');
    s.addEventListener('focus', () => { const ul = $('#sizebox ul'); ul.innerHTML = '<li role="presentation">REGULAR</li>';
      for (const z of ['XS (30-32)', 'S (34-36)', 'M (38-40)', 'L (42-44)', '__TALL', 'M', 'L']) { if (z === '__TALL') { ul.append(el('<li role="presentation">TALL</li>')); continue; } const li = el('<li role="option"></li>'); li.textContent = z; li.addEventListener('click', () => { s.value = z; window.state.size = z; ul.innerHTML = ''; }); ul.append(li); } });
  }
  function quote() { setTimeout(() => { if ($('[data-testid=Title]').value && window.state.category) $('[data-testid=SelectShipping]').value = 'USPS Ground Advantage'; }, 400); }
  $('[data-testid=Title]').addEventListener('input', quote);
  $('[data-testid=ShipsFromEditButton]').addEventListener('click', () => {
    const d = el('<div role="dialog" data-testid="DialogWrapper" id="addr"><button data-testid="MyAddressesDialog-Close">x</button><button data-testid="AddAddressButton">Add address</button></div>'); document.body.append(d);
    d.querySelector('[data-testid=MyAddressesDialog-Close]').addEventListener('click', () => d.remove());
    d.querySelector('[data-testid=AddAddressButton]').addEventListener('click', () => {
      const f = el('<div role="dialog" data-testid="DialogWrapper" id="addform"><input data-testid="AddressFirstName" autocomplete="given-name"><input data-testid="AddressLastName" autocomplete="family-name"><input data-testid="AddressLine1" autocomplete="address-line1"><input data-testid="AddressLine2"><input data-testid="AddressZipCode" autocomplete="postal-code"><input data-testid="AddressCity" autocomplete="address-level2"><div data-testid="AddressState" aria-haspopup="listbox">Select a state</div><ul id="states"></ul><button data-testid="SaveButton">Save Address</button></div>');
      document.body.append(f);
      f.querySelector('[data-testid=AddressState]').addEventListener('click', () => { for (const st of ['Alabama', 'California', 'Texas']) { const li = el('<li role="option" data-testid="AddressState-option"></li>'); li.textContent = st; li.addEventListener('click', () => { f.querySelector('[data-testid=AddressState]').textContent = st; $('#states').innerHTML = ''; }); $('#states').append(li); } });
      f.querySelector('[data-testid=SaveButton]').addEventListener('click', () => {
        const v = t => f.querySelector('[data-testid=' + t + ']').value;
        window.state.address = [v('AddressFirstName'), v('AddressLastName'), v('AddressLine1'), v('AddressCity'), f.querySelector('[data-testid=AddressState]').textContent, v('AddressZipCode')].join('|');
        $('#zip').textContent = v('AddressZipCode'); f.remove();
        d.append(el('<button data-testid="EditAddress">Edit</button>'));
      });
    });
  });
  $('#ShippingPayerOption').addEventListener('click', () => {
    const ul = el('<ul id="ShippingPayerOption" role="listbox"><li data-testid="FreeShippingYesButton">Yes (Recommended)</li><li data-testid="FreeShippingNoButton">No</li></ul>'); document.body.append(ul);
    ul.querySelector('[data-testid=FreeShippingNoButton]').addEventListener('click', () => { $('div#ShippingPayerOption').textContent = 'No'; ul.remove(); });
  });
  // A new price resets the shipping payer to Mercari's default a moment later.
  $('[data-testid=Price]').addEventListener('change', () => setTimeout(() => ($('div#ShippingPayerOption').textContent = 'Yes (Recommended)'), 600));
  $('[data-testid=SmartPricingButton]').addEventListener('click', () => {
    const m = el('<div role="dialog" data-testid="DialogWrapper" id="smart"><button data-testid="SmartPricingTurnOffButton">Turn off</button></div>'); document.body.append(m);
    m.querySelector('button').addEventListener('click', () => { const b = $('[data-testid=SmartPricingButton]'); b.setAttribute('aria-pressed', 'false'); b.textContent = 'OFF'; m.remove(); });
  });
  $('[data-testid=ListButton]').addEventListener('click', () => {
    if (window.needsCard) { document.body.append(el('<div role="dialog" data-testid="DialogWrapper"><div data-testid="PaymentWarningModal">You are almost done<button data-testid="AddCardButton">Add credit / debit card</button></div></div>')); return; }
    Object.assign(window.state, { title: $('[data-testid=Title]').value, price: $('[data-testid=Price]').value, payer: $('div#ShippingPayerOption').textContent, smart: $('[data-testid=SmartPricingButton]').textContent, photos: document.querySelectorAll('img[alt=thumbnail]').length, shipping: $('[data-testid=SelectShipping]').value });
    window.listed = window.state;
    history.pushState({}, '', '/sell/confirmation/m81234567890/');
  });
</script></body></html>`;

/**
 * Grailed's sell form as of October 2026: Radix menus that open on
 * pointerdown, a designer search that picks on mousedown, and a seller with
 * no saved return address yet.
 */
export const GRAILED_FORM = `<!doctype html><html><body><form id="f">
  <button type="button" aria-haspopup="menu" data-state="closed" id="m0">Department / Category</button>
  <button type="button" aria-haspopup="menu" data-state="closed" id="m1" disabled>Sub-category (Select category first)</button>
  <div><div><div><input id="designer-autocomplete" disabled placeholder="Designer (Select category first)"></div><ul role="menu" id="dlist"></ul></div></div>
  <button type="button" aria-haspopup="menu" data-state="closed" id="m2" disabled>Select Size (Select category first)</button>
  <input name="title" placeholder="Item name">
  <button type="button" aria-haspopup="menu" data-state="closed" id="m3">Select a Color</button>
  <button type="button" aria-haspopup="menu" data-state="closed" id="m4">Item Condition</button>
  <textarea name="description"></textarea>
  <button type="button" aria-haspopup="menu" data-state="closed" id="m5">Select a Style</button>
  <input name="price" type="tel">
  <input name="makeOffer" type="checkbox" checked>
  <input name="smartPricing.enabled" type="checkbox" checked>
  <div id="shipfrom"><button type="button" id="selectaddr">Select address</button></div>
  <div id="photos"></div>
  <button type="submit">SAVE AS DRAFT</button>
  <button type="submit" id="publish">PUBLISH</button>
</form>
<script>
  window.state = {};
  const $ = s => document.querySelector(s);
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
  $('#f').addEventListener('submit', e => e.preventDefault());
  const slots = () => { const p = $('#photos'); const have = p.querySelectorAll('img').length; p.querySelectorAll('input').forEach(i => i.remove()); for (let i = have; i < 9; i++) { const inp = el('<input type="file" multiple accept="image/*">'); inp.id = 'photo_input_' + i; inp.addEventListener('change', () => { for (const f of inp.files) { if (p.querySelectorAll('img').length >= 9) break; p.append(el('<img alt="Listing" style="display:block;width:20px;height:20px">')); } slots(); }); p.append(inp); } };
  slots();
  let open = null;
  function menu(button, items, onPick, header) {
    closeMenu();
    const m = el('<div role="menu" data-state="open"></div>'); if (header) m.append(header);
    for (const it of items) { const d = el('<div role="menuitem"></div>'); d.textContent = it; d.addEventListener('click', () => onPick(it, m)); m.append(d); }
    m.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    document.body.append(m); button.setAttribute('data-state', 'open'); open = { m, button };
    return m;
  }
  function closeMenu() { if (open) { open.m.remove(); open.button.setAttribute('data-state', 'closed'); open = null; } }
  const CATS = { Menswear: { Tops: ['Polos', 'Short Sleeve T-Shirts', 'Sweatshirts & Hoodies'], Bottoms: ['Denim', 'Shorts'] }, Womenswear: { Tops: ['Blouses', 'Hoodies'] } };
  let dept = null;
  function departments(button) {
    menu(button, Object.keys(CATS), d => { dept = d; categories(button); });
  }
  function categories(button) {
    const back = el('<div><button type="button" data-testid="back-button" aria-label="Back to departments"></button></div>');
    back.querySelector('button').addEventListener('click', () => departments(button));
    menu(button, Object.keys(CATS[dept]), c => { window.state.category = dept + ' / ' + c; button.textContent = window.state.category; closeMenu(); $('#m1').disabled = false; $('#m2').disabled = false; $('#designer-autocomplete').disabled = false; }, back);
  }
  const on = (id, fn) => $(id).addEventListener('pointerdown', e => { if (e.button === 0) fn($(id)); });
  on('#m0', b => (dept ? categories(b) : departments(b)));
  on('#m1', b => menu(b, CATS[dept][window.state.category.split(' / ')[1]], s => { window.state.subcategory = s; b.textContent = s; closeMenu(); }));
  on('#m2', b => menu(b, ['US XS / EU 42 / 0', 'US S / EU 44-46 / 1', 'US M / EU 48-50 / 2', 'US L / EU 52-54 / 3'], s => { window.state.size = s; b.textContent = s; closeMenu(); }));
  on('#m3', b => menu(b, ['Black', 'White', 'Brown', 'Blue', 'Multi'], s => { window.state.colour = s; b.textContent = s; closeMenu(); }));
  on('#m4', b => menu(b, ['New/Never Worn', 'Gently Used', 'Used', 'Very Worn'], s => { window.state.condition = s; b.textContent = s; closeMenu(); }));
  on('#m5', b => menu(b, ['None', 'Luxury', 'Vintage', 'Streetwear', 'Workwear'], s => { window.state.style = s; b.textContent = s; closeMenu(); }));
  const d = $('#designer-autocomplete'); let query = '';
  d.addEventListener('input', () => { query = d.value; setTimeout(() => { const ul = $('#dlist'); ul.innerHTML = '';
    for (const n of ['Carhartt', 'Carhartt Wip'].filter(n => query && n.toLowerCase().startsWith(query.toLowerCase()))) { const li = el('<li role="menuitem"></li>'); li.textContent = n; li.addEventListener('mousedown', () => { window.state.designer = n; query = ''; ul.innerHTML = ''; }); ul.append(li); }
    const un = el('<li role="menuitem"><span>Designer not listed / Not sure</span></li>'); un.addEventListener('mousedown', () => { window.state.designer = 'unbranded'; ul.innerHTML = ''; }); ul.append(un); }, 300); });
  d.addEventListener('blur', () => { $('#dlist').innerHTML = ''; d.value = window.state.designer === 'unbranded' ? 'Designer not listed' : (window.state.designer || ''); if (window.state.designer && !$('[aria-label="Clear selected designer"]')) d.after(el('<button type="button" aria-label="Clear selected designer">x</button>')); });
  $('#selectaddr').addEventListener('click', () => {
    const dlg = el('<div role="dialog"><p>My Addresses</p><button type="button" data-testid="modal-close" aria-label="Close">x</button><div id="list"><p>You have no saved addresses</p><button type="button" id="add"><p>Add new address</p></button></div><button type="submit" id="done" disabled>Done</button></div>');
    document.body.append(dlg);
    dlg.querySelector('[data-testid=modal-close]').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#add').addEventListener('click', () => {
      const form = el('<form><input id="recipientName" name="recipientName"><input id="line1" name="line1"><input id="line2" name="line2"><input id="city" name="city"><input id="state" name="state" placeholder="AL"><select id="countryCode" name="countryCode"><option value=""></option><option value="CA">Canada</option><option value="US">United States</option></select><input id="postalCode" name="postalCode"><input type="checkbox" name="defaultReturn"><button type="submit">SAVE ADDRESS</button></form>');
      dlg.querySelector('#list').replaceWith(form);
      form.addEventListener('submit', e => { e.preventDefault(); const v = n => form.querySelector('[name=' + n + ']').value;
        window.state.address = [v('recipientName'), v('line1'), v('city'), v('state'), v('countryCode'), v('postalCode'), form.querySelector('[name=defaultReturn]').checked].join('|');
        const list = el('<div id="list"><label><input type="radio" name="addr"> ' + v('line1') + '</label></div>'); form.replaceWith(list);
        list.querySelector('input').addEventListener('change', () => (dlg.querySelector('#done').disabled = false)); });
    });
    dlg.querySelector('#done').addEventListener('click', () => { $('#shipfrom').innerHTML = '<p>Ship from saved</p>'; dlg.remove(); });
  });
  $('#publish').addEventListener('click', () => {
    Object.assign(window.state, { title: $('[name=title]').value, price: $('[name=price]').value, smart: $('[name="smartPricing.enabled"]').checked, photos: document.querySelectorAll('#photos img').length, description: $('[name=description]').value.slice(0, 20) });
    window.listed = window.state;
    history.pushState({}, '', '/listings/71234567-carhartt-pocket-tee');
  });
</script></body></html>`;
