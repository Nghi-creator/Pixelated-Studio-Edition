import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";
import test from "node:test";
const { cameraDeathMonitor } = createRequire(import.meta.url)("./cameraDeathMonitor.cjs");

test("camera monitor uses the owned ChildProcess PID and requires abrupt reaped exit", async () => {
  const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), kill(){}});
  const camera = {pid:123,exitCode:null,signalCode:null};
  const lines=[];
  const monitor=cameraDeathMonitor(camera,"/tmp/n10-camera-death-owned",{spawn:(exe,args)=>{assert.equal(exe,"python3");assert.deepEqual(args.slice(-3),["--monitor","123","/tmp/n10-camera-death-owned"]);return child;},forward:line=>lines.push(line)});
  monitor.start();
  assert.throws(()=>monitor.start(),/already/);
  child.stdout.end("N10_ACCEPTANCE {}\n");
  child.emit("close",0,null);
  await monitor.finish(null,"SIGKILL");
  assert.deepEqual(lines,["N10_ACCEPTANCE {}"]);
  await assert.rejects(monitor.finish(0,null),/unconfirmed/);
});

test("monitor rejects dead camera and failed helper", async () => {
  const dead=cameraDeathMonitor({pid:123,exitCode:0,signalCode:null},"unused",{spawn:()=>assert.fail(),forward:()=>{}});
  assert.throws(()=>dead.start(),/live owned/);
  const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),kill(){}});
  const monitor=cameraDeathMonitor({pid:123,exitCode:null,signalCode:null},"unused",{spawn:()=>child,forward:()=>{}});
  monitor.start();child.emit("close",1,null);
  await assert.rejects(monitor.finish(null,"SIGKILL"),/unconfirmed/);
});
