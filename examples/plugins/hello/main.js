/**
 * Example plugin entry used by local dev load and marketplace packaging samples
 * Host injects global `pi`.
 */

/** Interval owned by the resident service; cleared when the host stops it. */
let heartbeat;
/** Returned by `muse.bus.subscribe`; called on unload to drop the route. */
let unsubscribe;

async function onLoad() {
 const settings = await muse.plugin.getSettings();

 await muse.commands.register({
 id: "hello.open",
 title: "Hello: Open Panel",
 keywords: ["hello", "demo"],
 run: async () => {
 await muse.ui.openPanel({ title: "Hello Plugin" });
 await muse.ui.showToast(settings.greeting || "Hello from plugin");
 // Declared in `contributes.bus.publish`; other plugins may listen.
 await muse.bus.publish("demo.hello.greeted", { greeting: settings.greeting });
 },
 });

 await muse.agent.registerTool({
 name: "echo_text",
 description: "Echo text back to the agent",
 risk: "low",
 schema: {
 type: "object",
 properties: {
 text: { type: "string" },
 },
 required: ["text"],
 },
 execute: async (args) => {
 const text = String(args?.text ?? "");
 return {
 ok: true,
 echo: text,
 pluginId: muse.plugin.getId(),
 };
 },
 });

 // A publisher never receives its own messages, so this only fires for
 // `demo.*` traffic from another plugin.
 unsubscribe = await muse.bus.subscribe("demo.**", async (message) => {
 await muse.ui.showToast(`bus: ${message.topic} from ${message.from}`);
 });

 // Resident service declared in `contributes.services`. The host starts it
 // after onLoad and restarts it with backoff if this process dies.
 muse.services.register({
 id: "greeter",
 start: ({ log }) => {
 log("greeter heartbeat started");
 heartbeat = setInterval(() => {
 void muse.bus.publish("demo.hello.tick", { at: new Date().toISOString() });
 }, 60_000);
 },
 stop: () => {
 clearInterval(heartbeat);
 heartbeat = undefined;
 },
 });
}

async function onUnload() {
 clearInterval(heartbeat);
 heartbeat = undefined;
 if (unsubscribe) {
 await unsubscribe();
 unsubscribe = undefined;
 }
 await muse.commands.unregister("hello.open");
 await muse.agent.unregisterTool("echo_text");
}

module.exports = {
 onLoad,
 onUnload,
};
