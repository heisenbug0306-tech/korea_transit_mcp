import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from "axios";

// API 키 설정
const SEOUL_API_KEY = process.env.SEOUL_API_KEY || "sample";
const DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY || "";

// MCP 서버 정보
const SERVER_INFO = {
  name: "korea-transit-mcp",
  version: "1.0.0",
};

// 도구 정의
const TOOLS = [
  {
    name: "getSubwayArrival",
    description: "서울 지하철 실시간 도착정보를 조회합니다. 역 이름을 입력하면 해당 역에 도착 예정인 열차 정보를 반환합니다.",
    inputSchema: {
      type: "object",
      properties: {
        stationName: {
          type: "string",
          description: "지하철역 이름 (예: 강남, 홍대입구, 서울역)",
        },
      },
      required: ["stationName"],
    },
  },
  {
    name: "getBusArrival",
    description: "서울 버스 정류장의 실시간 도착정보를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        arsId: {
          type: "string",
          description: "버스 정류장 ID (5자리 숫자)",
        },
      },
      required: ["arsId"],
    },
  },
  {
    name: "searchBusStation",
    description: "버스 정류장을 이름으로 검색합니다.",
    inputSchema: {
      type: "object",
      properties: {
        stationName: {
          type: "string",
          description: "검색할 정류장 이름",
        },
      },
      required: ["stationName"],
    },
  },
  {
    name: "getBikeStation",
    description: "서울 공공자전거(따릉이) 대여소 현황을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        stationName: {
          type: "string",
          description: "대여소 이름 또는 지역명",
        },
      },
      required: ["stationName"],
    },
  },
  {
    name: "getTransitInfo",
    description: "특정 위치 주변의 통합 교통정보를 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "위치명 (예: 강남역, 홍대입구)",
        },
      },
      required: ["location"],
    },
  },
];

// 도구 실행 함수들
async function getSubwayArrival(stationName: string): Promise<string> {
  try {
    const url = `http://swopenapi.seoul.go.kr/api/subway/${SEOUL_API_KEY}/json/realtimeStationArrival/0/10/${encodeURIComponent(stationName)}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data.errorMessage) {
      const errMsg = response.data.errorMessage;
      if (errMsg.code !== "INFO-000") {
        return `오류: ${errMsg.message}`;
      }
    }

    const arrivals = response.data.realtimeArrivalList || [];
    if (arrivals.length === 0) {
      return `${stationName}역의 도착 정보가 없습니다.`;
    }

    const formattedArrivals = arrivals.slice(0, 8).map((arr: any) => ({
      호선: arr.subwayId === "1001" ? "1호선" : arr.subwayId === "1002" ? "2호선" :
            arr.subwayId === "1003" ? "3호선" : arr.subwayId === "1004" ? "4호선" :
            arr.subwayId === "1005" ? "5호선" : arr.subwayId === "1006" ? "6호선" :
            arr.subwayId === "1007" ? "7호선" : arr.subwayId === "1008" ? "8호선" :
            arr.subwayId === "1009" ? "9호선" : arr.subwayId,
      방향: arr.updnLine,
      목적지: arr.bstatnNm,
      도착예정: arr.arvlMsg2,
      현재위치: arr.arvlMsg3,
    }));

    return `🚇 ${stationName}역 실시간 도착정보\n\n${JSON.stringify(formattedArrivals, null, 2)}`;
  } catch (error: any) {
    return `지하철 정보 조회 실패: ${error.message}`;
  }
}

async function getBusArrival(arsId: string): Promise<string> {
  try {
    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?serviceKey=${DATA_GO_KR_API_KEY}&arsId=${arsId}&resultType=json`;
    const response = await axios.get(url, { timeout: 10000 });
    const items = response.data?.msgBody?.itemList || [];

    if (items.length === 0) {
      return `정류장 ${arsId}의 버스 도착 정보가 없습니다.`;
    }

    const formattedBuses = items.slice(0, 8).map((bus: any) => ({
      버스번호: bus.rtNm,
      도착예정1: bus.arrmsg1,
      도착예정2: bus.arrmsg2,
      방향: bus.nxtStn + " 방면",
    }));

    return `🚌 정류장 ${arsId} 버스 도착정보\n\n${JSON.stringify(formattedBuses, null, 2)}`;
  } catch (error: any) {
    return `버스 정보 조회 실패: ${error.message}`;
  }
}

async function searchBusStation(stationName: string): Promise<string> {
  try {
    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByName?serviceKey=${DATA_GO_KR_API_KEY}&stSrch=${encodeURIComponent(stationName)}&resultType=json`;
    const response = await axios.get(url, { timeout: 10000 });
    const items = response.data?.msgBody?.itemList || [];

    if (items.length === 0) {
      return `'${stationName}'으로 검색된 정류장이 없습니다.`;
    }

    const formattedStations = items.slice(0, 10).map((station: any) => ({
      정류장명: station.stNm,
      정류장ID: station.arsId,
    }));

    return `🔍 '${stationName}' 검색 결과\n\n${JSON.stringify(formattedStations, null, 2)}`;
  } catch (error: any) {
    return `정류장 검색 실패: ${error.message}`;
  }
}

async function getBikeStation(stationName: string): Promise<string> {
  try {
    const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/bikeList/1/100/`;
    const response = await axios.get(url, { timeout: 10000 });
    const stations = response.data?.rentBikeStatus?.row || [];

    const filtered = stations.filter((s: any) =>
      s.stationName?.includes(stationName)
    );

    if (filtered.length === 0) {
      return `'${stationName}' 근처의 따릉이 대여소를 찾을 수 없습니다.`;
    }

    const formattedStations = filtered.slice(0, 10).map((station: any) => ({
      대여소명: station.stationName,
      대여가능: `${station.parkingBikeTotCnt}대`,
      거치대수: `${station.rackTotCnt}개`,
    }));

    return `🚲 '${stationName}' 따릉이 대여소 현황\n\n${JSON.stringify(formattedStations, null, 2)}`;
  } catch (error: any) {
    return `따릉이 정보 조회 실패: ${error.message}`;
  }
}

async function getTransitInfo(location: string): Promise<string> {
  const results: string[] = [];

  try {
    const subwayUrl = `http://swopenapi.seoul.go.kr/api/subway/${SEOUL_API_KEY}/json/realtimeStationArrival/0/5/${encodeURIComponent(location)}`;
    const subwayRes = await axios.get(subwayUrl, { timeout: 10000 });
    const arrivals = subwayRes.data.realtimeArrivalList || [];

    if (arrivals.length > 0) {
      const subwayInfo = arrivals.slice(0, 3).map((arr: any) =>
        `  - ${arr.trainLineNm}: ${arr.arvlMsg2}`
      ).join("\n");
      results.push(`🚇 지하철:\n${subwayInfo}`);
    }
  } catch (e) {}

  if (results.length === 0) {
    return `'${location}' 주변 교통정보를 찾을 수 없습니다.`;
  }

  return `📍 ${location} 주변 교통정보\n\n${results.join("\n\n")}`;
}

// 도구 실행
async function executeTool(name: string, args: any): Promise<string> {
  switch (name) {
    case "getSubwayArrival":
      return getSubwayArrival(args.stationName);
    case "getBusArrival":
      return getBusArrival(args.arsId);
    case "searchBusStation":
      return searchBusStation(args.stationName);
    case "getBikeStation":
      return getBikeStation(args.stationName);
    case "getTransitInfo":
      return getTransitInfo(args.location);
    default:
      return `알 수 없는 도구: ${name}`;
  }
}

// JSON-RPC 응답 생성
function jsonRpcResponse(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, x-session-id, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({
      status: "ok",
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      tools: TOOLS.map(t => t.name),
    });
  }

  // MCP JSON-RPC endpoint
  if (req.method === 'POST') {
    try {
      const body = req.body;
      const { jsonrpc, id, method, params } = body;

      if (jsonrpc !== "2.0") {
        return res.status(400).json(jsonRpcError(id, -32600, "Invalid JSON-RPC version"));
      }

      let result: any;

      switch (method) {
        case "initialize":
          result = {
            protocolVersion: params?.protocolVersion || "2024-11-05",
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: SERVER_INFO,
          };
          break;

        case "notifications/initialized":
          // 알림은 응답이 필요 없음
          return res.status(200).end();

        case "tools/list":
          result = { tools: TOOLS };
          break;

        case "tools/call":
          const toolName = params?.name;
          const toolArgs = params?.arguments || {};

          if (!toolName) {
            return res.status(400).json(jsonRpcError(id, -32602, "Missing tool name"));
          }

          const tool = TOOLS.find(t => t.name === toolName);
          if (!tool) {
            return res.status(400).json(jsonRpcError(id, -32602, `Unknown tool: ${toolName}`));
          }

          const toolResult = await executeTool(toolName, toolArgs);
          result = {
            content: [{ type: "text", text: toolResult }],
          };
          break;

        case "ping":
          result = {};
          break;

        default:
          return res.status(400).json(jsonRpcError(id, -32601, `Method not found: ${method}`));
      }

      return res.status(200).json(jsonRpcResponse(id, result));
    } catch (error: any) {
      console.error("MCP Error:", error);
      return res.status(500).json(jsonRpcError(null, -32603, error.message));
    }
  }

  // DELETE for session cleanup
  if (req.method === 'DELETE') {
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
