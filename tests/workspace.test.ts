import { expect, it } from 'vitest'
import { workspaceFromHost, upstreamUrl, defaults } from '../src/shared.ts'

it('从北京 API Host 提取空间并切换到 ASR WebSocket 路径', () => {
  const workspace = workspaceFromHost('https://ws-example.cn-beijing.maas.aliyuncs.com/compatible-mode/v1')
  expect(workspace).toEqual({ workspaceId: 'ws-example', region: 'beijing' })
  expect(upstreamUrl({ ...defaults, ...workspace })).toBe('wss://ws-example.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference')
  expect(workspaceFromHost('ws-example.cn-beijing.maas.aliyuncs.com')).toEqual(workspace)
})
it('支持新加坡，拒绝外部域名、混淆地址和明文协议', () => {
  expect(workspaceFromHost('https://ws-example.ap-southeast-1.maas.aliyuncs.com')).toEqual({ workspaceId: 'ws-example', region: 'singapore' })
  for (const url of ['https://evil.example', 'https://ws-example.cn-beijing.maas.aliyuncs.com.evil.example', 'http://ws-example.cn-beijing.maas.aliyuncs.com', 'https://user@ws-example.cn-beijing.maas.aliyuncs.com']) expect(workspaceFromHost(url)).toBeUndefined()
})
