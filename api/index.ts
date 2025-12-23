import type { VercelRequest, VercelResponse } from '@vercel/node';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import axios from "axios";

// API 키 설정
const SEOUL_API_KEY = process.env.SEOUL_API_KEY || "sample";
const DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY || "";

// MCP 서버 생성
const server = new McpServer({
  name: "korea-transit-mcp",
  version: "1.0.0",
});

// ===== 도구 정의 =====

// 1. 지하철 실시간 도착정보 조회
server.tool(
  "getSubwayArrival",
  "서울 지하철 실시간 도착정보를 조회합니다. 역 이름을 입력하면 해당 역에 도착 예정인 열차 정보를 반환합니다.",
  {
    stationName: z.string().describe("지하철역 이름 (예: 강남, 홍대입구, 서울역)"),
  },
  async ({ stationName }) => {
    try {
      const url = `http://swopenapi.seoul.go.kr/api/subway/${SEOUL_API_KEY}/json/realtimeStationArrival/0/10/${encodeURIComponent(stationName)}`;
      const response = await axios.get(url, { timeout: 10000 });

      if (response.data.errorMessage) {
        return {
          content: [{ type: "text" as const, text: `오류: ${response.data.errorMessage.message}` }],
        };
      }

      const arrivals = response.data.realtimeArrivalList || [];
      if (arrivals.length === 0) {
        return {
          content: [{ type: "text" as const, text: `${stationName}역의 도착 정보가 없습니다.` }],
        };
      }

      const formattedArrivals = arrivals.map((arr: any) => ({
        호선: arr.subwayId === "1001" ? "1호선" : arr.subwayId === "1002" ? "2호선" :
              arr.subwayId === "1003" ? "3호선" : arr.subwayId === "1004" ? "4호선" :
              arr.subwayId === "1005" ? "5호선" : arr.subwayId === "1006" ? "6호선" :
              arr.subwayId === "1007" ? "7호선" : arr.subwayId === "1008" ? "8호선" :
              arr.subwayId === "1009" ? "9호선" : arr.subwayId,
        방향: arr.updnLine === "상행" || arr.updnLine === "내선" ? "상행" : "하행",
        목적지: arr.bstatnNm,
        도착예정: arr.arvlMsg2,
        현재위치: arr.arvlMsg3,
      }));

      return {
        content: [{ type: "text" as const, text: `🚇 ${stationName}역 실시간 도착정보\n\n${JSON.stringify(formattedArrivals, null, 2)}` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `지하철 정보 조회 실패: ${error.message}` }],
      };
    }
  }
);

// 2. 버스 정류장 도착정보 조회
server.tool(
  "getBusArrival",
  "서울 버스 정류장의 실시간 도착정보를 조회합니다.",
  {
    arsId: z.string().describe("버스 정류장 ID (5자리 숫자)"),
  },
  async ({ arsId }) => {
    try {
      const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?serviceKey=${DATA_GO_KR_API_KEY}&arsId=${arsId}&resultType=json`;
      const response = await axios.get(url, { timeout: 10000 });
      const items = response.data?.msgBody?.itemList || [];

      if (items.length === 0) {
        return {
          content: [{ type: "text" as const, text: `정류장 ${arsId}의 버스 도착 정보가 없습니다.` }],
        };
      }

      const formattedBuses = items.map((bus: any) => ({
        버스번호: bus.rtNm,
        도착예정1: bus.arrmsg1,
        도착예정2: bus.arrmsg2,
        방향: bus.nxtStn + " 방면",
      }));

      return {
        content: [{ type: "text" as const, text: `🚌 정류장 ${arsId} 버스 도착정보\n\n${JSON.stringify(formattedBuses, null, 2)}` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `버스 정보 조회 실패: ${error.message}` }],
      };
    }
  }
);

// 3. 버스 정류장 검색
server.tool(
  "searchBusStation",
  "버스 정류장을 이름으로 검색합니다.",
  {
    stationName: z.string().describe("검색할 정류장 이름"),
  },
  async ({ stationName }) => {
    try {
      const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByName?serviceKey=${DATA_GO_KR_API_KEY}&stSrch=${encodeURIComponent(stationName)}&resultType=json`;
      const response = await axios.get(url, { timeout: 10000 });
      const items = response.data?.msgBody?.itemList || [];

      if (items.length === 0) {
        return {
          content: [{ type: "text" as const, text: `'${stationName}'으로 검색된 정류장이 없습니다.` }],
        };
      }

      const formattedStations = items.slice(0, 10).map((station: any) => ({
        정류장명: station.stNm,
        정류장ID: station.arsId,
      }));

      return {
        content: [{ type: "text" as const, text: `🔍 '${stationName}' 검색 결과\n\n${JSON.stringify(formattedStations, null, 2)}` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `정류장 검색 실패: ${error.message}` }],
      };
    }
  }
);

// 4. 따릉이 대여소 정보
server.tool(
  "getBikeStation",
  "서울 공공자전거(따릉이) 대여소 현황을 조회합니다.",
  {
    stationName: z.string().describe("대여소 이름 또는 지역명"),
  },
  async ({ stationName }) => {
    try {
      const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/bikeList/1/20/`;
      const response = await axios.get(url, { timeout: 10000 });
      const stations = response.data?.rentBikeStatus?.row || [];

      const filtered = stations.filter((s: any) =>
        s.stationName?.includes(stationName)
      );

      if (filtered.length === 0) {
        return {
          content: [{ type: "text" as const, text: `'${stationName}' 근처의 따릉이 대여소를 찾을 수 없습니다.` }],
        };
      }

      const formattedStations = filtered.slice(0, 10).map((station: any) => ({
        대여소명: station.stationName,
        대여가능: `${station.parkingBikeTotCnt}대`,
        거치대수: `${station.rackTotCnt}개`,
      }));

      return {
        content: [{ type: "text" as const, text: `🚲 '${stationName}' 따릉이 대여소 현황\n\n${JSON.stringify(formattedStations, null, 2)}` }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text" as const, text: `따릉이 정보 조회 실패: ${error.message}` }],
      };
    }
  }
);

// 5. 통합 교통정보 조회
server.tool(
  "getTransitInfo",
  "특정 위치 주변의 통합 교통정보를 조회합니다.",
  {
    location: z.string().describe("위치명 (예: 강남역, 홍대입구)"),
  },
  async ({ location }) => {
    const results: string[] = [];

    try {
      const subwayUrl = `http://swopenapi.seoul.go.kr/api/subway/${SEOUL_API_KEY}/json/realtimeStationArrival/0/5/${encodeURIComponent(location)}`;
      const subwayRes = await axios.get(subwayUrl, { timeout: 10000 });
      const arrivals = subwayRes.data.realtimeArrivalList || [];

      if (arrivals.length > 0) {
        const subwayInfo = arrivals.slice(0, 3).map((arr: any) =>
          `  - ${arr.subwayId === "1002" ? "2호선" : arr.subwayId} ${arr.updnLine} → ${arr.bstatnNm}: ${arr.arvlMsg2}`
        ).join("\n");
        results.push(`🚇 지하철:\n${subwayInfo}`);
      }
    } catch (e) {}

    if (results.length === 0) {
      return {
        content: [{ type: "text" as const, text: `'${location}' 주변 교통정보를 찾을 수 없습니다.` }],
      };
    }

    return {
      content: [{ type: "text" as const, text: `📍 ${location} 주변 교통정보\n\n${results.join("\n\n")}` }],
    };
  }
);

// Transport 저장소
const transports = new Map<string, StreamableHTTPServerTransport>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({
      status: "ok",
      name: "korea-transit-mcp",
      version: "1.0.0",
      tools: [
        "getSubwayArrival",
        "getBusArrival",
        "searchBusStation",
        "getBikeStation",
        "getTransitInfo"
      ]
    });
  }

  // MCP endpoint
  if (req.method === 'POST') {
    try {
      const sessionId = (req.headers["x-session-id"] as string) || "default";

      let transport = transports.get(sessionId);
      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => sessionId,
        });
        transports.set(sessionId, transport);
        await server.connect(transport);
      }

      // Vercel의 req/res를 Express 스타일로 변환
      const expressReq = req as any;
      const expressRes = res as any;

      await transport.handleRequest(expressReq, expressRes, req.body);
    } catch (error: any) {
      console.error("MCP Error:", error);
      return res.status(500).json({ error: error.message });
    }
  }
}
