---
title: "Dubbo 底层原理系列（八）：网络通信"
date: "2020-09-11"
excerpt: "深入解析 Dubbo 网络通信原理，包括 Netty 通信框架、编解码器、Channel Handler 以及通信协议设计。"
tags: ["Dubbo", "RPC", "Netty", "网络通信"]
series:
  slug: "dubbo-core-principles"
  title: "Dubbo 底层原理系列"
  order: 8
---

## 前言

网络通信是 Dubbo RPC 调用的基础，Dubbo 默认使用 Netty 作为通信框架，实现了高性能的网络传输。

## 技术亮点

| 技术点 | 难度 | 面试价值 | 本文覆盖 |
|--------|------|----------|----------|
| Netty 框架 | ⭐⭐⭐⭐ | 高频考点 | ✅ |
| 编解码器 | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Channel Handler | ⭐⭐⭐⭐ | 进阶考点 | ✅ |
| Dubbo 协议 | ⭐⭐⭐ | 高频考点 | ✅ |

## 面试考点

1. Dubbo 是如何实现网络通信的？
2. Dubbo 协议的格式是怎样的？
3. 编解码器是如何工作的？
4. Channel Handler 链是如何处理的？

## Netty 通信框架

### 架构概览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Dubbo Netty 架构                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Provider (服务端)                                              │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  NettyServer                                              │ │   │
│  │  │  ┌─────────────────────────────────────────────────────┐ │ │   │
│  │  │  │ ServerBootstrap                                     │ │ │   │
│  │  │  │     │                                               │ │ │   │
│  │  │  │     ├── Boss Group (接收连接)                        │ │ │   │
│  │  │  │     │       │                                       │ │ │   │
│  │  │  │     │       ▼                                       │ │ │   │
│  │  │  │     ├── Worker Group (处理 IO)                      │ │ │   │
│  │  │  │     │       │                                       │ │ │   │
│  │  │  │     │       ▼                                       │ │ │   │
│  │  │  │     └── ChannelPipeline                             │ │ │   │
│  │  │  │             │                                       │ │ │   │
│  │  │  │             ├── decoder (解码)                       │ │ │   │
│  │  │  │             ├── encoder (编码)                       │ │ │   │
│  │  │  │             ├── idle (空闲检测)                      │ │ │   │
│  │  │  │             └── handler (业务处理)                   │ │ │   │
│  │  │  └─────────────────────────────────────────────────────┘ │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Consumer (客户端)                                              │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  NettyClient                                              │ │   │
│  │  │  ┌─────────────────────────────────────────────────────┐ │ │   │
│  │  │  │ Bootstrap                                           │ │ │   │
│  │  │  │     │                                               │ │ │   │
│  │  │  │     ├── Worker Group (处理 IO)                      │ │ │   │
│  │  │  │     │       │                                       │ │ │   │
│  │  │  │     │       ▼                                       │ │ │   │
│  │  │  │     └── ChannelPipeline                             │ │ │   │
│  │  │  │             │                                       │ │ │   │
│  │  │  │             ├── encoder (编码)                       │ │ │   │
│  │  │  │             ├── decoder (解码)                       │ │ │   │
│  │  │  │             ├── idle (空闲检测)                      │ │ │   │
│  │  │  │             └── handler (响应处理)                   │ │ │   │
│  │  │  └─────────────────────────────────────────────────────┘ │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### NettyServer 初始化

```java
public class NettyServer extends AbstractServer {

    private ServerBootstrap bootstrap;
    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel channel;

    @Override
    protected void doOpen() throws Throwable {
        bootstrap = new ServerBootstrap();
        
        bossGroup = new NioEventLoopGroup(1, 
            new DefaultThreadFactory("NettyServerBoss", true));
        workerGroup = new NioEventLoopGroup(
            getUrl().getPositiveParameter(IO_THREADS_KEY, Constants.DEFAULT_IO_THREADS),
            new DefaultThreadFactory("NettyServerWorker", true));
        
        final NettyServerHandler handler = new NettyServerHandler(
            getUrl(), this);
        
        bootstrap.group(bossGroup, workerGroup)
            .channel(NioServerSocketChannel.class)
            .childOption(ChannelOption.TCP_NODELAY, true)
            .childOption(ChannelOption.SO_REUSEADDR, true)
            .childOption(ChannelOption.ALLOCATOR, PooledByteBufAllocator.DEFAULT)
            .childHandler(new ChannelInitializer<SocketChannel>() {
                @Override
                protected void initChannel(SocketChannel ch) throws Exception {
                    NettyChannel channel = NettyChannel.getOrAddChannel(ch, getUrl());
                    
                    ChannelPipeline pipeline = ch.pipeline();
                    // 编解码器
                    pipeline.addLast("decoder", new InternalDecoder());
                    pipeline.addLast("encoder", new InternalEncoder());
                    // 空闲检测
                    pipeline.addLast("server-idle-handler", 
                        new IdleStateHandler(0, 0, idleTimeout));
                    // 业务处理
                    pipeline.addLast("handler", handler);
                }
            });
        
        // 绑定端口
        channel = bootstrap.bind(getBindAddress()).sync().channel();
    }
}
```

## Dubbo 协议

### 协议格式

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Dubbo 协议格式                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Header (16 字节)                                               │   │
│  │  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐ │   │
│  │  │ 0-1 │  2  │  3  │  4  │  5  │  6  │  7  │ 8-11│12-15│     │ │   │
│  │  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤ │   │
│  │  │Magic│Flag │Status│Request ID                                │ │   │
│  │  │(2B) │(1B) │(1B) │(8B)                                      │ │   │
│  │  ├─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┤ │   │
│  │  │                    Data Length (4B)                        │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  │  Body (可变长度)                                                 │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                    Serialized Data                         │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  字段说明：                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  Magic Number (2B)：0xdabb，协议标识                             │   │
│  │                                                                 │   │
│  │  Flag (1B)：                                                    │   │
│  │  ┌───┬───┬───┬───┬───┬───┬───┬───┐                             │   │
│  │  │ 7 │ 6 │ 5 │ 4 │ 3 │ 2 │ 1 │ 0 │                             │   │
│  │  ├───┼───┼───┼───┼───┼───┼───┼───┤                             │   │
│  │  │Req│Two│Event│SerId│Serialization                │   │
│  │  │   │Way│    │     │                                   │   │
│  │  └───┴───┴───┴───┴───┴───────────────────────────────┘                             │   │
│  │  • Req: 请求/响应标识                                            │   │
│  │  • TwoWay: 是否双向                                             │   │
│  │  • Event: 是否事件                                              │   │
│  │  • Serialization: 序列化方式                                     │   │
│  │                                                                 │   │
│  │  Status (1B)：响应状态码                                         │   │
│  │  • 20: OK                                                       │   │
│  │  • 30: CLIENT_TIMEOUT                                           │   │
│  │  • 40: SERVER_TIMEOUT                                           │   │
│  │  • 50: BAD_REQUEST                                              │   │
│  │  • 60: BAD_RESPONSE                                             │   │
│  │                                                                 │   │
│  │  Request ID (8B)：请求唯一标识，用于关联请求和响应                 │   │
│  │                                                                 │   │
│  │  Data Length (4B)：消息体长度                                    │   │
│  │                                                                 │   │
│  │  Body：序列化后的请求数据或响应数据                               │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 编解码器

### InternalEncoder

```java
public class InternalEncoder extends MessageToByteEncoder {

    @Override
    protected void encode(ChannelHandlerContext ctx, Object msg, ByteBuf out) 
            throws Exception {
        ChannelBuffer buffer = new NettyBackedChannelBuffer(out);
        
        // 获取序列化方式
        Serialization serialization = getSerialization(channel.getUrl());
        
        // 写入 Header
        byte[] header = new byte[HEADER_LENGTH];
        // Magic Number
        Bytes.short2bytes(MAGIC, header);
        
        if (msg instanceof Request) {
            // 请求消息
            Request request = (Request) msg;
            header[2] = (byte) (FLAG_REQUEST | serialization.getContentTypeId());
            if (request.isTwoWay()) {
                header[2] |= FLAG_TWOWAY;
            }
            Bytes.long2bytes(request.getId(), header, 4);
            
            // 序列化请求体
            Bytes.int2bytes(saveRequest(buffer, serialization, request), header, 12);
            
        } else if (msg instanceof Response) {
            // 响应消息
            Response response = (Response) msg;
            header[2] = serialization.getContentTypeId();
            header[3] = response.getStatus();
            Bytes.long2bytes(response.getId(), header, 4);
            
            // 序列化响应体
            Bytes.int2bytes(saveResponse(buffer, serialization, response), header, 12);
        }
        
        // 写入 Header
        out.writeBytes(header);
    }
}
```

### InternalDecoder

```java
public class InternalDecoder extends ByteToMessageDecoder {

    @Override
    protected void decode(ChannelHandlerContext ctx, ByteBuf in, List<Object> out) 
            throws Exception {
        // 检查是否可读 Header
        if (in.readableBytes() < HEADER_LENGTH) {
            return;
        }
        
        in.markReaderIndex();
        
        // 读取 Magic Number
        short magic = in.readShort();
        if (magic != MAGIC) {
            throw new IOException("Invalid magic number");
        }
        
        // 读取 Flag
        byte flag = in.readByte();
        // 读取 Status
        byte status = in.readByte();
        // 读取 Request ID
        long requestId = in.readLong();
        // 读取 Data Length
        int dataLength = in.readInt();
        
        // 检查消息体是否完整
        if (in.readableBytes() < dataLength) {
            in.resetReaderIndex();
            return;
        }
        
        // 读取消息体
        byte[] data = new byte[dataLength];
        in.readBytes(data);
        
        // 反序列化
        Object msg;
        Serialization serialization = getSerialization(channel.getUrl());
        
        if ((flag & FLAG_REQUEST) != 0) {
            // 解码请求
            msg = decodeRequest(data, serialization);
        } else {
            // 解码响应
            msg = decodeResponse(data, serialization, status);
        }
        
        out.add(msg);
    }
}
```

## Channel Handler

### Handler 链

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Channel Handler 链                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  服务端 Handler 链：                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  ChannelPipeline                                               │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  decoder ──► idle ──► handler ──► encoder                 │ │   │
│  │  │     │          │          │          │                    │ │   │
│  │  │     ▼          ▼          ▼          ▼                    │ │   │
│  │  │  解码请求   空闲检测   业务处理   编码响应                   │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  客户端 Handler 链：                                                    │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  ChannelPipeline                                               │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  encoder ──► decoder ──► idle ──► handler                 │ │   │
│  │  │     │          │          │          │                    │ │   │
│  │  │     ▼          ▼          ▼          ▼                    │ │   │
│  │  │  编码请求   解码响应   空闲检测   响应处理                   │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### NettyServerHandler

```java
public class NettyServerHandler extends ChannelDuplexHandler {

    private final ChannelHandler handler;

    @Override
    public void channelRead(ChannelHandlerContext ctx, Object msg) throws Exception {
        NettyChannel channel = NettyChannel.getOrAddChannel(ctx.channel(), url);
        
        try {
            // 调用 Dubbo 内部 Handler 处理
            handler.received(channel, msg);
        } finally {
            NettyChannel.removeChannelIfDisconnected(ctx.channel());
        }
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) throws Exception {
        NettyChannel channel = NettyChannel.getOrAddChannel(ctx.channel(), url);
        
        try {
            handler.disconnected(channel);
        } finally {
            NettyChannel.removeChannelIfDisconnected(ctx.channel());
        }
    }

    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object evt) throws Exception {
        // 空闲事件处理
        if (evt instanceof IdleStateEvent) {
            NettyChannel channel = NettyChannel.getOrAddChannel(ctx.channel(), url);
            
            try {
                handler.disconnected(channel);
            } finally {
                NettyChannel.removeChannelIfDisconnected(ctx.channel());
            }
        }
    }
}
```

### ExchangeHandler

```java
public class ExchangeHandler implements ChannelHandler {

    @Override
    public void received(Channel channel, Object message) throws RemotingException {
        if (message instanceof Invocation) {
            // 处理 RPC 请求
            reply((ExchangeChannel) channel, message);
        } else if (message instanceof Response) {
            // 处理响应
            handleResponse(channel, (Response) message);
        } else {
            // 其他消息类型
            handler.received(channel, message);
        }
    }

    @Override
    public Object reply(ExchangeChannel channel, Object message) throws RemotingException {
        Invocation inv = (Invocation) message;
        
        // 获取 Invoker
        Invoker<?> invoker = getInvoker(channel, inv);
        
        // 执行调用
        Result result = invoker.invoke(inv);
        
        return result;
    }
}
```

## 连接管理

### 连接池

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        连接管理                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  客户端连接池：                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │  NettyClient                                                   │   │
│  │  ┌───────────────────────────────────────────────────────────┐ │   │
│  │  │                                                           │ │   │
│  │  │  连接配置：                                                 │ │   │
│  │  │  • connections: 连接数（默认 1）                            │ │   │
│  │  │  • iothreads: IO 线程数                                    │ │   │
│  │  │  • connect.timeout: 连接超时                               │ │   │
│  │  │                                                           │ │   │
│  │  │  Channel 缓存：                                            │ │   │
│  │  │  ConcurrentMap<String, Channel> channels                   │ │   │
│  │  │                                                           │ │   │
│  │  └───────────────────────────────────────────────────────────┘ │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  连接复用：                                                             │
│  • 多个服务共享同一连接                                                 │
│  • 长连接，减少连接创建开销                                             │
│  • 心跳保活，自动重连                                                   │
│                                                                         │
│  配置示例：                                                             │
│  <dubbo:protocol connections="2" />                                     │
│  <dubbo:consumer connections="1" />                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 心跳机制

```java
public class HeartbeatHandler extends AbstractChannelHandlerDelegate {

    @Override
    public void received(Channel channel, Object message) throws RemotingException {
        if (message instanceof HeartbeatRequest) {
            // 响应心跳请求
            HeartbeatResponse response = new HeartbeatResponse();
            channel.send(response);
        } else if (message instanceof HeartbeatResponse) {
            // 收到心跳响应
            // 更新最后心跳时间
        } else {
            handler.received(channel, message);
        }
    }
}
```

## 总结

本文介绍了 Dubbo 网络通信原理：

| 概念 | 说明 |
|------|------|
| Netty | 高性能网络框架 |
| Dubbo 协议 | 16 字节 Header + 可变 Body |
| 编解码器 | InternalEncoder/InternalDecoder |
| Handler 链 | decoder → idle → handler → encoder |

## 参考资料

- [Dubbo 协议](https://dubbo.apache.org/zh/docs/v2.7/user/protocol/dubbo/)
- [NettyServer 源码](https://github.com/apache/dubbo/tree/master/dubbo-remoting/dubbo-remoting-netty4)

## 下一章预告

下一章将深入解析 **线程模型原理**，包括：
- IO 线程与业务线程
- 线程池模型
- 线程派发策略
