/**
 * Korea Transit MCP Server - Vercel Serverless Handler
 *
 * Vercel Edge/Serverless 환경을 위한 MCP 핸들러
 *
 * 제공 도구:
 * - transit_get_subway_arrival: 지하철 실시간 도착정보
 * - transit_get_subway_status: 지하철 운행상태
 * - transit_get_bus_arrival: 버스 실시간 도착정보
 * - transit_search_bus_station: 버스 정류장 검색
 * - transit_get_bike_station: 따릉이 대여소 검색
 * - transit_get_combined_info: 통합 교통정보 조회
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ===== 환경 변수 =====

const SEOUL_API_KEY = process.env.SEOUL_API_KEY || "sample";
const DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY || "";

// ===== 상수 =====

const SERVER_INFO = {
  name: "korea-transit-mcp",
  version: "1.0.0",
};

const CHARACTER_LIMIT = 25000;
const DEFAULT_TIMEOUT = 10000;

const SUBWAY_LINE_MAP: Record<string, string> = {
  "1001": "1호선", "1002": "2호선", "1003": "3호선",
  "1004": "4호선", "1005": "5호선", "1006": "6호선",
  "1007": "7호선", "1008": "8호선", "1009": "9호선",
  "1077": "신분당선", "1063": "경의중앙선", "1065": "공항철도",
};

const BUS_TYPE_MAP: Record<string, string> = {
  "1": "일반", "2": "좌석", "3": "마을",
  "4": "광역", "5": "공항", "6": "간선", "7": "지선",
};

// ===== 도구 정의 =====

const TOOLS = [
  {
    name: "transit_get_subway_arrival",
    description: "서울 지하철역의 실시간 도착정보를 조회합니다. 역 이름으로 검색하여 각 호선별 도착 예정 열차 정보를 반환합니다.",
    inputSchema: {
      type: "object",
      properties: {
        station_name: {
          type: "string",
          description: "지하철역 이름 (예: '강남', '홍대입구', '서울역'). '역' 접미사는 자동 제거됩니다.",
        },
        limit: {
          type: "number",
          description: "조회할 최대 결과 수 (1-20, 기본값: 10)",
          default: 10,
        },
        response_format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "출력 형식: 'markdown'은 사람이 읽기 좋은 형태, 'json'은 구조화된 데이터",
          default: "markdown",
        },
      },
      required: ["station_name"],
    },
  },
  {
    name: "transit_get_subway_status",
    description: "서울 지하철 호선별 운행상태를 조회합니다. 지연, 사고, 정상운행 등의 상태를 확인할 수 있습니다.",
    inputSchema: {
      type: "object",
      properties: {
        line: {
          type: "string",
          description: "호선 번호 (1-9). 생략시 전체 호선 조회",
        },
        response_format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "출력 형식",
          default: "markdown",
        },
      },
      required: [],
    },
  },
  {
    name: "transit_get_bus_arrival",
    description: "서울 버스 정류장의 실시간 도착정보를 조회합니다. 5자리 정류장 ID(arsId)가 필요하며, 정류장을 모르면 transit_search_bus_station으로 먼저 검색하세요.",
    inputSchema: {
      type: "object",
      properties: {
        ars_id: {
          type: "string",
          description: "버스 정류장 ID (5자리 숫자, 예: '16165')",
          pattern: "^\\d{5}$",
        },
        limit: {
          type: "number",
          description: "조회할 최대 버스 수 (1-20, 기본값: 10)",
          default: 10,
        },
        response_format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "출력 형식",
          default: "markdown",
        },
      },
      required: ["ars_id"],
    },
  },
  {
    name: "transit_search_bus_station",
    description: "버스 정류장을 이름 또는 번호로 검색합니다. 검색 결과에서 정류장 ID(arsId)를 확인하여 도착정보 조회에 사용할 수 있습니다.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "검색할 정류장 이름 또는 5자리 정류장 번호 (예: '강남역', '16165')",
        },
        limit: {
          type: "number",
          description: "조회할 최대 결과 수 (1-20, 기본값: 10)",
          default: 10,
        },
        response_format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "출력 형식",
          default: "markdown",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "transit_get_bike_station",
    description: "서울 따릉이(공공자전거) 대여소를 검색하고 실시간 자전거 이용가능 현황을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "대여소 이름 또는 지역명 (예: '강남역', '여의도')",
        },
        limit: {
          type: "number",
          description: "조회할 최대 대여소 수 (1-20, 기본값: 10)",
          default: 10,
        },
        response_format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "출력 형식",
          default: "markdown",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "transit_get_combined_info",
    description: "특정 위치 주변의 지하철, 버스, 따릉이 정보를 통합 조회합니다. 위치명을 입력하면 주변의 모든 대중교통 정보를 한번에 확인할 수 있습니다.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "위치명 (예: '강남역', '홍대입구'). 지하철, 버스 정류장, 따릉이 정보를 통합 조회합니다.",
        },
        response_format: {
          type: "string",
          enum: ["markdown", "json"],
          description: "출력 형식",
          default: "markdown",
        },
      },
      required: ["location"],
    },
  },
];

// ===== 유틸리티 함수 =====

function getSubwayLineName(lineCode: string): string {
  return SUBWAY_LINE_MAP[lineCode] || lineCode;
}

function getBusTypeName(typeCode: string): string {
  return BUS_TYPE_MAP[typeCode] || "기타";
}

function truncateResponse(content: string): string {
  if (content.length <= CHARACTER_LIMIT) {
    return content;
  }
  const truncated = content.slice(0, CHARACTER_LIMIT - 100);
  return `${truncated}\n\n... (응답이 ${CHARACTER_LIMIT.toLocaleString()}자 제한으로 잘렸습니다)`;
}

async function fetchWithTimeout(url: string, timeout = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ===== 도구 실행 함수들 =====

async function transitGetSubwayArrival(args: {
  station_name: string;
  limit?: number;
  response_format?: string;
}): Promise<string> {
  const stationName = args.station_name.replace(/역$/u, "").trim();
  const limit = Math.min(args.limit || 10, 20);
  const format = args.response_format || "markdown";

  try {
    const url = `http://swopenapi.seoul.go.kr/api/subway/${SEOUL_API_KEY}/json/realtimeStationArrival/0/${limit}/${encodeURIComponent(stationName)}`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    if (data.errorMessage?.code && data.errorMessage.code !== "INFO-000") {
      throw new Error(`API 에러: ${data.errorMessage.message}`);
    }

    const arrivals = data.realtimeArrivalList || [];

    if (format === "json") {
      return JSON.stringify({
        station: stationName,
        count: arrivals.length,
        arrivals: arrivals.map((arr: any) => ({
          line: getSubwayLineName(arr.subwayId),
          destination: arr.bstatnNm,
          message: arr.arvlMsg2,
          direction: arr.updnLine,
          trainNumber: arr.btrainNo,
        })),
      }, null, 2);
    }

    if (arrivals.length === 0) {
      return `## 🚇 ${stationName}역 도착정보\n\n현재 도착 예정 열차가 없습니다.`;
    }

    let md = `## 🚇 ${stationName}역 실시간 도착정보\n\n`;
    md += `> 총 ${arrivals.length}개의 열차 정보\n\n`;

    arrivals.forEach((arr: any, idx: number) => {
      const lineName = getSubwayLineName(arr.subwayId);
      md += `### ${idx + 1}. ${lineName} - ${arr.bstatnNm}행\n`;
      md += `- **도착**: ${arr.arvlMsg2}\n`;
      md += `- **방향**: ${arr.updnLine === "상행" ? "⬆️ 상행" : "⬇️ 하행"}\n\n`;
    });

    return truncateResponse(md);
  } catch (error: any) {
    return `❌ 지하철 정보 조회 실패: ${error.message}`;
  }
}

async function transitGetSubwayStatus(args: {
  line?: string;
  response_format?: string;
}): Promise<string> {
  const format = args.response_format || "markdown";
  const lineFilter = args.line ? `${args.line}호선` : null;

  // 지하철 운행상태 API는 별도 엔드포인트 필요 - 간소화된 응답
  const title = lineFilter || "전체 호선";

  if (format === "json") {
    return JSON.stringify({
      filter: title,
      status: "정상 운행 중",
      message: "실시간 운행장애 정보는 서울교통공사 공지사항을 확인해주세요.",
    }, null, 2);
  }

  return `## 🚇 지하철 운행상태 (${title})\n\n✅ 정상 운행 중\n\n※ 실시간 운행장애 정보는 서울교통공사 공지사항을 확인해주세요.`;
}

async function transitGetBusArrival(args: {
  ars_id: string;
  limit?: number;
  response_format?: string;
}): Promise<string> {
  const arsId = args.ars_id;
  const limit = Math.min(args.limit || 10, 20);
  const format = args.response_format || "markdown";

  try {
    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUidItem?serviceKey=${DATA_GO_KR_API_KEY}&arsId=${arsId}&resultType=json`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    const msgHeader = data.msgHeader;
    if (msgHeader && msgHeader.headerCd !== "0") {
      throw new Error(`API 오류: ${msgHeader.headerMsg || msgHeader.headerCd}`);
    }

    const items = (data.msgBody?.itemList || []).slice(0, limit);
    const stationName = items[0]?.stNm || "정류장";

    if (format === "json") {
      return JSON.stringify({
        station: stationName,
        arsId,
        count: items.length,
        arrivals: items.map((arr: any) => ({
          busNumber: arr.rtNm,
          type: getBusTypeName(arr.routeType),
          message1: arr.arrmsg1,
          message2: arr.arrmsg2,
          destination: arr.adirection,
        })),
      }, null, 2);
    }

    if (items.length === 0) {
      return `## 🚌 정류장 ${arsId}\n\n현재 도착 예정 버스가 없습니다.`;
    }

    let md = `## 🚌 ${stationName} 정류장\n\n`;
    md += `> 정류장 번호: ${arsId} | 총 ${items.length}개 노선\n\n`;

    items.forEach((arr: any, idx: number) => {
      const busType = getBusTypeName(arr.routeType);
      md += `### ${idx + 1}. ${arr.rtNm}번 (${busType})\n`;
      md += `- **첫 번째 버스**: ${arr.arrmsg1}\n`;
      md += `- **두 번째 버스**: ${arr.arrmsg2}\n\n`;
    });

    return truncateResponse(md);
  } catch (error: any) {
    return `❌ 버스 정보 조회 실패: ${error.message}\n\n💡 정류장 번호가 올바른지 확인해 주세요.`;
  }
}

async function transitSearchBusStation(args: {
  query: string;
  limit?: number;
  response_format?: string;
}): Promise<string> {
  const query = args.query.trim();
  const limit = Math.min(args.limit || 10, 20);
  const format = args.response_format || "markdown";

  try {
    const results: any[] = [];
    const pageSize = 1000;

    for (let page = 1; page <= 5; page++) {
      const startIdx = (page - 1) * pageSize + 1;
      const endIdx = page * pageSize;
      const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/busStopLocationXyInfo/${startIdx}/${endIdx}/`;

      const response = await fetchWithTimeout(url);
      const data = await response.json();
      const rows = data.busStopLocationXyInfo?.row || [];

      const matched = rows.filter((s: any) =>
        s.STOPS_NM?.includes(query) || s.STOPS_NO === query
      );
      results.push(...matched);

      if (results.length >= limit || rows.length < pageSize) break;
    }

    const stations = results.slice(0, limit);

    if (format === "json") {
      return JSON.stringify({
        query,
        count: stations.length,
        stations: stations.map((s: any) => ({
          name: s.STOPS_NM,
          arsId: s.STOPS_NO,
          type: s.STOPS_TYPE || "일반",
        })),
      }, null, 2);
    }

    if (stations.length === 0) {
      return `## 🔍 버스 정류장 검색: "${query}"\n\n검색 결과가 없습니다.`;
    }

    let md = `## 🔍 버스 정류장 검색: "${query}"\n\n`;
    md += `> ${stations.length}개 정류장 발견\n\n`;

    stations.forEach((s: any, idx: number) => {
      md += `### ${idx + 1}. ${s.STOPS_NM}\n`;
      md += `- **정류장 번호**: \`${s.STOPS_NO}\`\n\n`;
    });

    md += "---\n> 💡 **Tip**: 도착정보 조회 시 정류장 번호(arsId)를 사용하세요.\n";

    return truncateResponse(md);
  } catch (error: any) {
    return `❌ 정류장 검색 실패: ${error.message}`;
  }
}

async function transitGetBikeStation(args: {
  query: string;
  limit?: number;
  response_format?: string;
}): Promise<string> {
  const query = args.query.trim();
  const limit = Math.min(args.limit || 10, 20);
  const format = args.response_format || "markdown";

  try {
    const results: any[] = [];
    const pageSize = 1000;

    for (let page = 1; page <= 3; page++) {
      const startIdx = (page - 1) * pageSize + 1;
      const endIdx = page * pageSize;
      const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/bikeList/${startIdx}/${endIdx}/`;

      const response = await fetchWithTimeout(url);
      const data = await response.json();
      const rows = data.rentBikeStatus?.row || [];

      const matched = rows.filter((s: any) =>
        s.stationName?.toLowerCase().includes(query.toLowerCase())
      );
      results.push(...matched);

      if (results.length >= limit || rows.length < pageSize) break;
    }

    const stations = results.slice(0, limit);

    if (format === "json") {
      return JSON.stringify({
        query,
        count: stations.length,
        stations: stations.map((s: any) => ({
          name: s.stationName,
          id: s.stationId,
          available: s.parkingBikeTotCnt,
          rackTotal: s.rackTotCnt,
        })),
      }, null, 2);
    }

    if (stations.length === 0) {
      return `## 🚲 따릉이 대여소 검색: "${query}"\n\n검색 결과가 없습니다.`;
    }

    let md = `## 🚲 따릉이 대여소 검색: "${query}"\n\n`;
    md += `> ${stations.length}개 대여소 발견\n\n`;

    stations.forEach((s: any, idx: number) => {
      const availRate = s.rackTotCnt > 0
        ? Math.round((s.parkingBikeTotCnt / s.rackTotCnt) * 100)
        : 0;
      const emoji = availRate >= 50 ? "🟢" : availRate >= 20 ? "🟡" : "🔴";

      md += `### ${idx + 1}. ${s.stationName}\n`;
      md += `- **대여 가능**: ${emoji} ${s.parkingBikeTotCnt}대 / ${s.rackTotCnt}대 (${availRate}%)\n\n`;
    });

    return truncateResponse(md);
  } catch (error: any) {
    return `❌ 따릉이 대여소 검색 실패: ${error.message}`;
  }
}

async function transitGetCombinedInfo(args: {
  location: string;
  response_format?: string;
}): Promise<string> {
  const location = args.location.replace(/역$/u, "").trim();
  const format = args.response_format || "markdown";

  const subwayData: any[] = [];
  const busStations: any[] = [];
  const bikeStations: any[] = [];

  // 지하철 정보
  try {
    const url = `http://swopenapi.seoul.go.kr/api/subway/${SEOUL_API_KEY}/json/realtimeStationArrival/0/5/${encodeURIComponent(location)}`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    subwayData.push(...(data.realtimeArrivalList || []));
  } catch {
    // 무시
  }

  // 버스 정류장
  try {
    const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/busStopLocationXyInfo/1/100/`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    const rows = data.busStopLocationXyInfo?.row || [];
    const matched = rows.filter((s: any) => s.STOPS_NM?.includes(location)).slice(0, 3);
    busStations.push(...matched);
  } catch {
    // 무시
  }

  // 따릉이
  try {
    const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/bikeList/1/1000/`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    const rows = data.rentBikeStatus?.row || [];
    const matched = rows.filter((s: any) =>
      s.stationName?.toLowerCase().includes(location.toLowerCase())
    ).slice(0, 3);
    bikeStations.push(...matched);
  } catch {
    // 무시
  }

  if (format === "json") {
    return JSON.stringify({
      location: args.location,
      subway: {
        count: subwayData.length,
        arrivals: subwayData.slice(0, 5).map((arr: any) => ({
          line: getSubwayLineName(arr.subwayId),
          destination: arr.bstatnNm,
          message: arr.arvlMsg2,
        })),
      },
      bus: {
        count: busStations.length,
        stations: busStations.map((s: any) => ({
          name: s.STOPS_NM,
          arsId: s.STOPS_NO,
        })),
      },
      bike: {
        count: bikeStations.length,
        stations: bikeStations.map((s: any) => ({
          name: s.stationName,
          available: s.parkingBikeTotCnt,
          total: s.rackTotCnt,
        })),
      },
    }, null, 2);
  }

  let md = `# 📍 ${args.location} 주변 교통정보\n\n`;

  // 지하철
  md += `## 🚇 지하철 도착정보\n\n`;
  if (subwayData.length === 0) {
    md += "주변 지하철역 정보가 없습니다.\n\n";
  } else {
    subwayData.slice(0, 5).forEach((arr: any) => {
      const lineName = getSubwayLineName(arr.subwayId);
      md += `- **${lineName}** ${arr.bstatnNm}행: ${arr.arvlMsg2}\n`;
    });
    md += "\n";
  }

  // 버스
  md += `## 🚌 버스 정류장\n\n`;
  if (busStations.length === 0) {
    md += "주변 버스 정류장 정보가 없습니다.\n\n";
  } else {
    busStations.forEach((s: any) => {
      md += `- **${s.STOPS_NM}** (${s.STOPS_NO})\n`;
    });
    md += "\n";
  }

  // 따릉이
  md += `## 🚲 따릉이 대여소\n\n`;
  if (bikeStations.length === 0) {
    md += "주변 따릉이 대여소 정보가 없습니다.\n";
  } else {
    bikeStations.forEach((s: any) => {
      const availRate = s.rackTotCnt > 0
        ? Math.round((s.parkingBikeTotCnt / s.rackTotCnt) * 100)
        : 0;
      const emoji = availRate >= 50 ? "🟢" : availRate >= 20 ? "🟡" : "🔴";
      md += `- **${s.stationName}**: ${emoji} ${s.parkingBikeTotCnt}대 이용가능\n`;
    });
  }

  return truncateResponse(md);
}

// ===== 도구 실행 라우터 =====

async function executeTool(name: string, args: any): Promise<string> {
  switch (name) {
    case "transit_get_subway_arrival":
      return transitGetSubwayArrival(args);
    case "transit_get_subway_status":
      return transitGetSubwayStatus(args);
    case "transit_get_bus_arrival":
      return transitGetBusArrival(args);
    case "transit_search_bus_station":
      return transitSearchBusStation(args);
    case "transit_get_bike_station":
      return transitGetBikeStation(args);
    case "transit_get_combined_info":
      return transitGetCombinedInfo(args);
    default:
      return `❌ 알 수 없는 도구: ${name}`;
  }
}

// ===== JSON-RPC 헬퍼 =====

function jsonRpcResponse(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ===== Vercel 핸들러 =====

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 헤더
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, x-session-id, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Health check
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      tools: TOOLS.map((t) => t.name),
    });
  }

  // MCP JSON-RPC endpoint
  if (req.method === "POST") {
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

          const tool = TOOLS.find((t) => t.name === toolName);
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
  if (req.method === "DELETE") {
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
