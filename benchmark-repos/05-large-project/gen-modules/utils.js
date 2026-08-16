const fs = require('fs');
const path = require('path');

const ENTITIES = ['User','Product','Order','Invoice','Payment','Subscription','Organization','Team',
  'Project','Task','Comment','Notification','File','Message','Event','Schedule','Report',
  'Dashboard','Widget','Template','Rule','Policy','Permission','Role','Token','Session',
  'Activity','Log','Metric','Alert','Workflow','Pipeline','Stage','Condition','Action',
  'Trigger','Webhook','Integration','Channel','Provider','Campaign','Segment','Audience',
  'Email','Sms','Push','Form','Field','Response','Survey','Feedback',
  'Ticket','Issue','Bug','Feature','Sprint','Backlog','Kanban','Board','Label',
  'Tag','Category','Taxonomy','Asset','Resource','Deployment','Release','Version',
  'Commit','Branch','PullRequest','CodeReview','Approval','Checklist',
  'Step','Gate','Review'];

const DOMAINS = ['Auth','Payment','User','Organization','Project','Task','Notification','Integration',
  'Search','Analytics','Reporting','Workflow','File','Email','Sms','Push',
  'Webhook','Config','Queue','Cache','Scheduler','Monitor','Storage','Security'];

const UTIL_TYPES = ['debounce','throttle','deepClone','deepEqual','merge','pick','omit','groupBy',
  'chunk','flatten','unique','clamp','lerp','randomInt','randomString','sleep',
  'timeout','deferred','pipe','compose','memoize','once','tap','thru'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pascalCase(s) { return s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(''); }
function camelCase(s) { const p = pascalCase(s); return p[0].toLowerCase() + p.slice(1); }
function generateId() { return Math.random().toString(36).substr(2, 9); }

function mkdirp(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function write(filePath, content) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

module.exports = { ENTITIES, DOMAINS, UTIL_TYPES, pick, pascalCase, camelCase, generateId, mkdirp, write };
