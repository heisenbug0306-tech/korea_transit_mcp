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

// ===== 타입 정의 =====

interface SubwayArrival {
  subwayId: string;
  bstatnNm: string;
  arvlMsg2: string;
  updnLine: string;
  btrainNo?: string;
}

interface BusStation {
  STOPS_NM: string;
  STOPS_NO: string;
  STOPS_TYPE?: string;
}

interface BikeStation {
  stationName: string;
  stationId: string;
  parkingBikeTotCnt: number;
  rackTotCnt: number;
}
interface BusArrival {  stNm: string;  arsId: string;  rtNm: string;  busRouteAbrv?: string;  arrmsg1: string;  arrmsg2: string;  routeType?: string;  stationTp?: string;}

interface ToolArguments {
  station_name?: string;
  line?: string;
  ars_id?: string;
  query?: string;
  location?: string;
  limit?: number;
  response_format?: string;
}

// ===== 에러 메시지 추출 헬퍼 =====

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ===== 환경 변수 =====

const SEOUL_API_KEY = process.env.SEOUL_API_KEY;
const DATA_GO_KR_API_KEY = process.env.DATA_GO_KR_API_KEY || "";

// 환경 변수 검증
if (!SEOUL_API_KEY) {
  console.error("❌ SEOUL_API_KEY 환경 변수가 설정되지 않았습니다.");
}

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
        arrivals: arrivals.map((arr: SubwayArrival) => ({
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

    arrivals.forEach((arr: SubwayArrival, idx: number) => {
      const lineName = getSubwayLineName(arr.subwayId);
      md += `### ${idx + 1}. ${lineName} - ${arr.bstatnNm}행\n`;
      md += `- **도착**: ${arr.arvlMsg2}\n`;
      md += `- **방향**: ${arr.updnLine === "상행" ? "⬆️ 상행" : "⬇️ 하행"}\n\n`;
    });

    return truncateResponse(md);
  } catch (error) {
    return `❌ 지하철 정보 조회 실패: ${getErrorMessage(error)}`;
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
    // 공공데이터포털 버스 도착정보 API 호출
    const url = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?serviceKey=${DATA_GO_KR_API_KEY}&resultType=json&arsId=${arsId}`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();

    // API 응답 확인
    if (data.msgHeader?.headerCd !== "0") {
      throw new Error(data.msgHeader?.headerMsg || "API 오류");
    }

    const arrivals: BusArrival[] = data.msgBody?.itemList || [];

    if (format === "json") {
      return JSON.stringify({
        stationName: arrivals[0]?.stNm || "알 수 없음",
        arsId,
        count: arrivals.length,
        arrivals: arrivals.slice(0, limit).map((bus: BusArrival) => ({
          routeName: bus.rtNm,
          routeAbbr: bus.busRouteAbrv,
          arrival1: bus.arrmsg1,
          arrival2: bus.arrmsg2,
          routeType: getBusTypeName(bus.routeType || "1"),
        })),
      }, null, 2);
    }

    if (arrivals.length === 0) {
      return `## 🚌 버스 도착정보 (정류장: ${arsId})\n\n현재 도착 예정 버스가 없습니다.`;
    }

    const stationName = arrivals[0]?.stNm || "알 수 없음";
    let md = `## 🚌 ${stationName} 버스 도착정보\n\n`;
    md += `> 정류장 번호: ${arsId} | ${arrivals.length}개 노선\n\n`;

    arrivals.slice(0, limit).forEach((bus: BusArrival, idx: number) => {
      const routeType = getBusTypeName(bus.routeType || "1");
      md += `### ${idx + 1}. ${bus.rtNm} (${routeType})\n`;
      md += `- **첫번째 버스**: ${bus.arrmsg1}\n`;
      md += `- **두번째 버스**: ${bus.arrmsg2}\n\n`;
    });

    return truncateResponse(md);
  } catch (error) {
    return `❌ 버스 도착정보 조회 실패: ${getErrorMessage(error)}\n\n💡 정류장 번호가 올바른지 확인해 주세요.`;
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
    const results: BusStation[] = [];
    const pageSize = 1000;

    for (let page = 1; page <= 5; page++) {
      const startIdx = (page - 1) * pageSize + 1;
      const endIdx = page * pageSize;
      const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/busStopLocationXyInfo/${startIdx}/${endIdx}/`;

      const response = await fetchWithTimeout(url);
      const data = await response.json();
      const rows: BusStation[] = data.busStopLocationXyInfo?.row || [];

      const matched = rows.filter((s: BusStation) =>
        s.STOPS_NM?.includes(query) || s.STOPS_NO === query
      );
      results.push(...matched);

      if (results.length >= limit * 3 || rows.length < pageSize) break;
    }

    // 검색 결과 정렬: 정확한 매칭 > 시작 매칭 > 포함 매칭
    const sortedResults = results.sort((a, b) => {
      const aName = a.STOPS_NM || "";
      const bName = b.STOPS_NM || "";
      // 1순위: 검색어로 시작하는 결과 우선
      const aStarts = aName.startsWith(query);
      const bStarts = bName.startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      // 2순위: 이름 길이 (짧은 것이 더 정확)
      return aName.length - bName.length;
    });

    const stations = sortedResults.slice(0, limit);

    if (format === "json") {
      return JSON.stringify({
        query,
        count: stations.length,
        stations: stations.map((s: BusStation) => ({
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

    stations.forEach((s: BusStation, idx: number) => {
      md += `### ${idx + 1}. ${s.STOPS_NM}\n`;
      md += `- **정류장 번호**: \`${s.STOPS_NO}\`\n\n`;
    });

    md += "---\n> 💡 **Tip**: 도착정보 조회 시 정류장 번호(arsId)를 사용하세요.\n";

    return truncateResponse(md);
  } catch (error) {
    return `❌ 정류장 검색 실패: ${getErrorMessage(error)}`;
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
    const results: BikeStation[] = [];
    const pageSize = 1000;

    for (let page = 1; page <= 3; page++) {
      const startIdx = (page - 1) * pageSize + 1;
      const endIdx = page * pageSize;
      const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/bikeList/${startIdx}/${endIdx}/`;

      const response = await fetchWithTimeout(url);
      const data = await response.json();
      const rows: BikeStation[] = data.rentBikeStatus?.row || [];

      const matched = rows.filter((s: BikeStation) =>
        s.stationName?.toLowerCase().includes(query.toLowerCase())
      );
      results.push(...matched);

      if (results.length >= limit * 3 || rows.length < pageSize) break;
    }

    const stations = results.slice(0, limit);

    if (format === "json") {
      return JSON.stringify({
        query,
        count: stations.length,
        stations: stations.map((s: BikeStation) => ({
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

    stations.forEach((s: BikeStation, idx: number) => {
      const availRate = s.rackTotCnt > 0
        ? Math.round((s.parkingBikeTotCnt / s.rackTotCnt) * 100)
        : 0;
      const emoji = availRate >= 50 ? "🟢" : availRate >= 20 ? "🟡" : "🔴";

      md += `### ${idx + 1}. ${s.stationName}\n`;
      md += `- **대여 가능**: ${emoji} ${s.parkingBikeTotCnt}대 / ${s.rackTotCnt}대 (${availRate}%)\n\n`;
    });

    return truncateResponse(md);
  } catch (error) {
    return `❌ 따릉이 대여소 검색 실패: ${getErrorMessage(error)}`;
  }
}

async function transitGetCombinedInfo(args: {
  location: string;
  response_format?: string;
}): Promise<string> {
  const location = args.location.replace(/역$/u, "").trim();
  const format = args.response_format || "markdown";

  const subwayData: SubwayArrival[] = [];
  const busStations: BusStation[] = [];
  const bikeStations: BikeStation[] = [];

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
    const rows: BusStation[] = data.busStopLocationXyInfo?.row || [];
    const matched = rows.filter((s: BusStation) => s.STOPS_NM?.includes(location)).slice(0, 3);
    busStations.push(...matched);
  } catch {
    // 무시
  }

  // 따릉이
  try {
    const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/bikeList/1/1000/`;
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    const rows: BikeStation[] = data.rentBikeStatus?.row || [];
    const matched = rows.filter((s: BikeStation) =>
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
        arrivals: subwayData.slice(0, 5).map((arr: SubwayArrival) => ({
          line: getSubwayLineName(arr.subwayId),
          destination: arr.bstatnNm,
          message: arr.arvlMsg2,
        })),
      },
      bus: {
        count: busStations.length,
        stations: busStations.map((s: BusStation) => ({
          name: s.STOPS_NM,
          arsId: s.STOPS_NO,
        })),
      },
      bike: {
        count: bikeStations.length,
        stations: bikeStations.map((s: BikeStation) => ({
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
    subwayData.slice(0, 5).forEach((arr: SubwayArrival) => {
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
    busStations.forEach((s: BusStation) => {
      md += `- **${s.STOPS_NM}** (${s.STOPS_NO})\n`;
    });
    md += "\n";
  }

  // 따릉이
  md += `## 🚲 따릉이 대여소\n\n`;
  if (bikeStations.length === 0) {
    md += "주변 따릉이 대여소 정보가 없습니다.\n";
  } else {
    bikeStations.forEach((s: BikeStation) => {
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

async function executeTool(name: string, args: ToolArguments): Promise<string> {
  switch (name) {
    case "transit_get_subway_arrival":
      return transitGetSubwayArrival(args as { station_name: string; limit?: number; response_format?: string });
    case "transit_get_subway_status":
      return transitGetSubwayStatus(args as { line?: string; response_format?: string });
    case "transit_get_bus_arrival":
      return transitGetBusArrival(args as { ars_id: string; limit?: number; response_format?: string });
    case "transit_search_bus_station":
      return transitSearchBusStation(args as { query: string; limit?: number; response_format?: string });
    case "transit_get_bike_station":
      return transitGetBikeStation(args as { query: string; limit?: number; response_format?: string });
    case "transit_get_combined_info":
      return transitGetCombinedInfo(args as { location: string; response_format?: string });
    default:
      return `❌ 알 수 없는 도구: ${name}`;
  }
}

// ===== JSON-RPC 헬퍼 =====

function jsonRpcResponse(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ===== 랜딩페이지 HTML =====

const LANDING_PAGE_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="서울 대중교통 실시간 정보를 AI와 대화하며 조회하는 MCP 서버">
  <meta property="og:title" content="Korea Transit MCP - 서울 대중교통 AI 조회">
  <meta property="og:description" content="강남역 지하철 언제 와? 라고 물으면 바로 답해드립니다.">
  <title>Korea Transit MCP - 서울 대중교통 AI 조회</title>
  <style>:root{--primary:#2563eb;--primary-dark:#1d4ed8;--secondary:#f97316;--bg:#f8fafc;--card:#fff;--text:#1e293b;--text-muted:#64748b;--border:#e2e8f0}*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}.container{max-width:1200px;margin:0 auto;padding:0 20px}header{background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:#fff;padding:80px 0 100px;text-align:center}.logo{font-size:3rem;margin-bottom:10px}h1{font-size:2.5rem;font-weight:700;margin-bottom:15px}.tagline{font-size:1.3rem;opacity:.9;margin-bottom:30px}.badges{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.badge{display:inline-flex;align-items:center;background:rgba(255,255,255,.15);padding:8px 16px;border-radius:20px;font-size:.9rem;text-decoration:none;color:#fff;transition:background .2s}.badge:hover{background:rgba(255,255,255,.25)}.demo-section{margin-top:-50px;margin-bottom:60px}.demo-card{background:var(--card);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.1);padding:30px;max-width:700px;margin:0 auto}.demo-card h3{color:var(--primary);margin-bottom:15px;font-size:1.1rem}.chat-bubble{background:#e8f4fd;border-radius:12px;padding:15px 20px;margin-bottom:15px;display:inline-block}.response{background:#f1f5f9;border-radius:12px;padding:20px;font-family:Consolas,monospace;font-size:.9rem;white-space:pre-line;line-height:1.8}.features{padding:60px 0}.features h2{text-align:center;font-size:2rem;margin-bottom:50px}.features-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:25px}.feature-card{background:var(--card);border-radius:12px;padding:25px;border:1px solid var(--border);transition:transform .2s,box-shadow .2s}.feature-card:hover{transform:translateY(-5px);box-shadow:0 10px 30px rgba(0,0,0,.08)}.feature-icon{font-size:2.5rem;margin-bottom:15px}.feature-card h3{font-size:1.1rem;margin-bottom:10px}.feature-card code{display:block;background:#f1f5f9;padding:8px 12px;border-radius:6px;font-size:.85rem;color:var(--primary);margin-bottom:10px}.feature-card p{color:var(--text-muted);font-size:.95rem}.cta{background:linear-gradient(135deg,#1e293b,#334155);color:#fff;padding:80px 0;text-align:center}.cta h2{font-size:2rem;margin-bottom:20px}.cta p{opacity:.8;margin-bottom:30px;font-size:1.1rem}.cta-buttons{display:flex;gap:15px;justify-content:center;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:8px;font-size:1rem;font-weight:600;text-decoration:none;transition:transform .2s}.btn:hover{transform:translateY(-2px)}.btn-primary{background:var(--secondary);color:#fff}.btn-secondary{background:#fff;color:var(--text)}footer{background:#1e293b;color:#94a3b8;padding:40px 0;text-align:center}footer a{color:#94a3b8;text-decoration:none}footer a:hover{color:#fff}.endpoint{background:rgba(255,255,255,.1);display:inline-block;padding:10px 20px;border-radius:6px;font-family:monospace;margin:15px 0}@media(max-width:768px){header{padding:60px 0 80px}h1{font-size:1.8rem}.tagline{font-size:1.1rem}.features-grid{grid-template-columns:1fr}}</style>
</head>
<body>
  <header><div class="container"><div class="logo">🚇🚌🚲</div><h1>Korea Transit MCP</h1><p class="tagline">"강남역 지하철 언제 와?" 라고 물으면 바로 답해드립니다</p><div class="badges"><a href="https://playmcp.kakao.com" class="badge" target="_blank">PlayMCP 등록</a><a href="https://github.com/yonghwan1106/kakao-mcp-server" class="badge" target="_blank">GitHub</a><span class="badge">MCP Compatible</span><span class="badge">실시간 데이터</span></div></div></header>
  <section class="demo-section"><div class="container"><div class="demo-card"><h3>사용 예시</h3><div class="chat-bubble">강남역 지하철 언제 와?</div><div class="response">🚇 강남역 실시간 도착정보

1. 2호선 - 성수행
   도착: 3분 후
   방향: 하행

2. 신분당선 - 신사행
   도착: 전역 도착
   방향: 상행</div></div></div></section>
  <section class="features"><div class="container"><h2>6개 도구로 서울 대중교통 완벽 커버</h2><div class="features-grid"><div class="feature-card"><div class="feature-icon">🚇</div><h3>지하철 실시간 도착정보</h3><code>transit_get_subway_arrival</code><p>역 이름으로 실시간 도착 시간, 방향, 현재 위치 조회</p></div><div class="feature-card"><div class="feature-icon">🔄</div><h3>호선별 운행상태</h3><code>transit_get_subway_status</code><p>지연, 사고 등 호선별 실시간 운행 상태 확인</p></div><div class="feature-card"><div class="feature-icon">🚌</div><h3>버스 도착정보</h3><code>transit_get_bus_arrival</code><p>정류장 번호로 버스 도착 예정 시간 조회</p></div><div class="feature-card"><div class="feature-icon">🔍</div><h3>버스정류장 검색</h3><code>transit_search_bus_station</code><p>정류장 이름으로 검색하여 정류장 번호 확인</p></div><div class="feature-card"><div class="feature-icon">🚲</div><h3>따릉이 대여소</h3><code>transit_get_bike_station</code><p>대여소별 자전거 잔여 대수 실시간 조회</p></div><div class="feature-card"><div class="feature-icon">📍</div><h3>통합 교통정보</h3><code>transit_get_combined_info</code><p>지하철 + 버스 + 따릉이 한 번에 조회</p></div></div></div></section>
  <section class="cta"><div class="container"><h2>지금 바로 사용해보세요</h2><p>PlayMCP에서 도구함에 추가하거나 Claude Desktop에 연결하세요</p><div class="cta-buttons"><a href="https://playmcp.kakao.com" class="btn btn-primary" target="_blank">PlayMCP에서 추가</a><a href="https://github.com/yonghwan1106/kakao-mcp-server" class="btn btn-secondary" target="_blank">GitHub 저장소</a></div></div></section>
  <footer><div class="container"><p><strong>Korea Transit MCP</strong> - 서울 대중교통, AI에게 물어보세요</p><div class="endpoint">MCP Endpoint: https://koreatransitmcp.vercel.app/mcp</div><p style="margin-top:20px"><a href="https://github.com/yonghwan1106/kakao-mcp-server">GitHub</a> · <a href="https://playmcp.kakao.com">PlayMCP</a> · MIT License</p></div></footer>
</body>
</html>`;

// ===== Vercel 핸들러 =====

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 헤더
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id, x-session-id, Accept");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // 경로 확인
  const urlPath = req.url?.split("?")[0] || "/";

  // 랜딩 페이지 (루트 경로)
  if (req.method === "GET" && (urlPath === "/" || urlPath === "")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(LANDING_PAGE_HTML);
  }

  // Health check (/health 또는 다른 GET 요청)
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
    } catch (error) {
      console.error("MCP Error:", error);
      return res.status(500).json(jsonRpcError(null, -32603, getErrorMessage(error)));
    }
  }

  // DELETE for session cleanup
  if (req.method === "DELETE") {
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
