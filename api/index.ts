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

// 테스트용 샘플 데이터 (서울 열린데이터 API가 해외 IP 차단으로 인해 사용)
const SAMPLE_SUBWAY_DATA: Record<string, any[]> = {
  "강남": [
    { 호선: "2호선", 방향: "외선", 목적지: "성수", 도착예정: "3분 후", 현재위치: "역삼" },
    { 호선: "2호선", 방향: "내선", 목적지: "신도림", 도착예정: "5분 후", 현재위치: "삼성" },
    { 호선: "신분당선", 방향: "상행", 목적지: "신사", 도착예정: "2분 후", 현재위치: "양재시민의숲" },
  ],
  "홍대입구": [
    { 호선: "2호선", 방향: "외선", 목적지: "성수", 도착예정: "4분 후", 현재위치: "신촌" },
    { 호선: "2호선", 방향: "내선", 목적지: "신도림", 도착예정: "2분 후", 현재위치: "합정" },
    { 호선: "공항철도", 방향: "공항방면", 목적지: "인천공항T2", 도착예정: "6분 후", 현재위치: "디지털미디어시티" },
  ],
  "서울역": [
    { 호선: "1호선", 방향: "상행", 목적지: "소요산", 도착예정: "3분 후", 현재위치: "남영" },
    { 호선: "1호선", 방향: "하행", 목적지: "천안", 도착예정: "5분 후", 현재위치: "시청" },
    { 호선: "4호선", 방향: "상행", 목적지: "당고개", 도착예정: "2분 후", 현재위치: "숙대입구" },
  ],
};

// 도구 실행 함수들
async function getSubwayArrival(stationName: string): Promise<string> {
  try {
    const url = `http://swopenapi.seoul.go.kr/api/subway/${SEOUL_API_KEY}/json/realtimeStationArrival/0/10/${encodeURIComponent(stationName)}`;
    const response = await axios.get(url, { timeout: 5000 });

    if (response.data.errorMessage) {
      const errMsg = response.data.errorMessage;
      if (errMsg.code !== "INFO-000") {
        throw new Error(errMsg.message);
      }
    }

    const arrivals = response.data.realtimeArrivalList || [];
    if (arrivals.length === 0) {
      throw new Error("도착 정보 없음");
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
    // API 실패 시 샘플 데이터로 폴백
    const sampleData = SAMPLE_SUBWAY_DATA[stationName] || SAMPLE_SUBWAY_DATA["강남"];
    return `🚇 ${stationName}역 도착정보 (데모 데이터)\n\n${JSON.stringify(sampleData, null, 2)}\n\n⚠️ 참고: 서울 열린데이터 API 접속 불가로 데모 데이터를 표시합니다.`;
  }
}

async function getBusArrival(arsId: string): Promise<string> {
  try {
    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?serviceKey=${DATA_GO_KR_API_KEY}&arsId=${arsId}&resultType=json`;
    const response = await axios.get(url, { timeout: 5000 });
    const items = response.data?.msgBody?.itemList || [];

    if (items.length === 0) {
      throw new Error("버스 정보 없음");
    }

    const formattedBuses = items.slice(0, 8).map((bus: any) => ({
      버스번호: bus.rtNm,
      도착예정1: bus.arrmsg1,
      도착예정2: bus.arrmsg2,
      방향: bus.nxtStn + " 방면",
    }));

    return `🚌 정류장 ${arsId} 버스 도착정보\n\n${JSON.stringify(formattedBuses, null, 2)}`;
  } catch (error: any) {
    // API 실패 시 샘플 데이터
    const sampleBuses = [
      { 버스번호: "146", 도착예정1: "3분 후", 도착예정2: "10분 후", 방향: "강남역 방면" },
      { 버스번호: "360", 도착예정1: "5분 후", 도착예정2: "15분 후", 방향: "사당역 방면" },
      { 버스번호: "740", 도착예정1: "곧 도착", 도착예정2: "8분 후", 방향: "잠실역 방면" },
    ];
    return `🚌 정류장 ${arsId} 버스 도착정보 (데모 데이터)\n\n${JSON.stringify(sampleBuses, null, 2)}\n\n⚠️ 참고: 공공데이터 API 접속 불가로 데모 데이터를 표시합니다.`;
  }
}

async function searchBusStation(stationName: string): Promise<string> {
  try {
    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByName?serviceKey=${DATA_GO_KR_API_KEY}&stSrch=${encodeURIComponent(stationName)}&resultType=json`;
    const response = await axios.get(url, { timeout: 5000 });
    const items = response.data?.msgBody?.itemList || [];

    if (items.length === 0) {
      throw new Error("정류장 없음");
    }

    const formattedStations = items.slice(0, 10).map((station: any) => ({
      정류장명: station.stNm,
      정류장ID: station.arsId,
    }));

    return `🔍 '${stationName}' 검색 결과\n\n${JSON.stringify(formattedStations, null, 2)}`;
  } catch (error: any) {
    // 샘플 데이터
    const sampleStations = [
      { 정류장명: `${stationName}역`, 정류장ID: "12345" },
      { 정류장명: `${stationName}사거리`, 정류장ID: "12346" },
      { 정류장명: `${stationName}입구`, 정류장ID: "12347" },
    ];
    return `🔍 '${stationName}' 검색 결과 (데모 데이터)\n\n${JSON.stringify(sampleStations, null, 2)}\n\n⚠️ 참고: 공공데이터 API 접속 불가로 데모 데이터를 표시합니다.`;
  }
}

async function getBikeStation(stationName: string): Promise<string> {
  try {
    const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/bikeList/1/100/`;
    const response = await axios.get(url, { timeout: 5000 });
    const stations = response.data?.rentBikeStatus?.row || [];

    const filtered = stations.filter((s: any) =>
      s.stationName?.includes(stationName)
    );

    if (filtered.length === 0) {
      throw new Error("대여소 없음");
    }

    const formattedStations = filtered.slice(0, 10).map((station: any) => ({
      대여소명: station.stationName,
      대여가능: `${station.parkingBikeTotCnt}대`,
      거치대수: `${station.rackTotCnt}개`,
    }));

    return `🚲 '${stationName}' 따릉이 대여소 현황\n\n${JSON.stringify(formattedStations, null, 2)}`;
  } catch (error: any) {
    // 샘플 데이터
    const sampleBikes = [
      { 대여소명: `${stationName}역 1번출구`, 대여가능: "12대", 거치대수: "20개" },
      { 대여소명: `${stationName}역 2번출구`, 대여가능: "8대", 거치대수: "15개" },
      { 대여소명: `${stationName} 사거리`, 대여가능: "5대", 거치대수: "10개" },
    ];
    return `🚲 '${stationName}' 따릉이 대여소 현황 (데모 데이터)\n\n${JSON.stringify(sampleBikes, null, 2)}\n\n⚠️ 참고: 서울 열린데이터 API 접속 불가로 데모 데이터를 표시합니다.`;
  }
}

async function getTransitInfo(location: string): Promise<string> {
  // 항상 샘플 데이터 반환 (해외 서버에서 API 접속 불가)
  const sampleTransit = `📍 ${location} 주변 교통정보 (데모 데이터)

🚇 지하철:
  - 2호선 (외선): 3분 후 도착
  - 2호선 (내선): 5분 후 도착
  - 신분당선: 2분 후 도착

🚌 버스:
  - 146번: 곧 도착
  - 360번: 5분 후

🚲 따릉이:
  - ${location}역 1번출구: 12대 대여가능
  - ${location}역 2번출구: 8대 대여가능

⚠️ 참고: 서울 열린데이터 API 접속 불가로 데모 데이터를 표시합니다.`;

  return sampleTransit;
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
      debug: {
        seoulApiKeyLength: SEOUL_API_KEY?.length || 0,
        seoulApiKeyPrefix: SEOUL_API_KEY?.substring(0, 8) || "none",
        hasDataGoKrKey: !!DATA_GO_KR_API_KEY,
      }
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
