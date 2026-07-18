import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const client = fs.readFileSync(new URL('../public/admin-cms.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.textContent = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }
}

async function renderOperations(view, rows) {
  const targetId = view === 'sources' ? 'admin-source-list' : 'admin-quarantine-list';
  const target = new FakeElement('div');
  const requests = [];
  const document = {
    readyState: 'complete',
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => (id === targetId ? target : null),
    querySelector: (selector) => (selector === '[data-admin-cms]' ? { dataset: { adminView: view } } : null),
    addEventListener() {},
  };
  const window = {
    computeCurrentAdmin: {
      user: { id: 'reviewer' },
      csrfToken: 'csrf',
      async requestJson(url) {
        requests.push(url);
        return { rows };
      },
      setStatus() {},
    },
    addEventListener() {},
  };

  vm.runInNewContext(client, { document, window, URLSearchParams, FormData, File, FileReader: class {} });
  await new Promise((resolve) => setImmediate(resolve));
  return { requests, list: target.children[0] };
}

test('source-health rows render actual source fields instead of the Record fallback', async () => {
  const { requests, list } = await renderOperations('sources', [{
    source_name: '<GridWire>',
    source_id: 'grid-wire',
    status: 'stale',
  }]);

  assert.deepEqual(requests, ['/api/admin/operations?view=sources']);
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0].children[0].tagName, 'STRONG');
  assert.equal(list.children[0].children[0].textContent, '<GridWire>');
  assert.equal(list.children[0].children[1].textContent, 'grid-wire · stale');
  assert.notEqual(list.children[0].textContent, 'Record');
});

test('quarantine rows show review context and a safely encoded editor link', async () => {
  const { requests, list } = await renderOperations('quarantine', [{
    id: 'grid/queue review',
    title: 'Grid queue review',
    public_status: 'noindex',
    source: 'Utility Dive',
    quarantine_reason: '<unsupported claim>',
  }]);

  assert.deepEqual(requests, ['/api/admin/operations?view=quarantine']);
  const [title, details, reason, link] = list.children[0].children;
  assert.equal(title.textContent, 'Grid queue review');
  assert.equal(details.textContent, 'noindex · Utility Dive');
  assert.equal(reason.textContent, 'Reason: <unsupported claim>');
  assert.equal(link.textContent, 'Review in editor');
  assert.equal(link.attributes.href, '/admin/articles/grid%2Fqueue%20review/edit');
});
