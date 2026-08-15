/**
 * Standalone build config for the dsh-workbench plugin: the node-half lib/
 * (host fs + unified git services) plus the browser bundle lib/client.js
 * (closure-factory artifact for the GUI's __ModuleLoader__). The client entry
 * is auto-detected at src/client/index.ts by the preset.
 *
 * NOTE: the id passed to clientBundle() MUST be the full package name
 * (including the scope). It becomes the module id the client bundle registers
 * via window.__ModuleLoader__.load({id}), and the loader resolves plugin
 * modules by package name — `dsh-workbench` (no scope) made every boot fail
 * with "loaded without registering @doebkblcya/dsh-workbench".
 */
import { clientBundle } from './shared/tsdown.client.ts'

export default clientBundle('@doebkblcya/dsh-workbench', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-subprocess',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-workspace',
  ],
})
