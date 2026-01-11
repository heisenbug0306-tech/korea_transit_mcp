# Korea Transit MCP Server

서울 실시간 대중교통 정보를 제공하는 MCP(Model Context Protocol) 서버입니다.

[![Deploy](https://img.shields.io/badge/Vercel-Deployed-brightgreen)](https://koreatransitmcp.vercel.app)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)

## 배포 URL

```
https://koreatransitmcp.vercel.app/mcp
```

## 제공 도구 (6개)

| 도구 | 설명 |
|------|------|
| `transit_get_subway_arrival` | 서울 지하철 실시간 도착정보 조회 |
| `transit_get_subway_status` | 지하철 호선별 운행상태 조회 |
| `transit_get_bus_arrival` | 버스 정류장 실시간 도착정보 조회 |
| `transit_search_bus_station` | 버스 정류장 이름/번호 검색 |
| `transit_get_bike_station` | 따릉이 대여소 현황 조회 |
| `transit_get_combined_info` | 통합 교통정보 조회 |

## MCP 클라이언트 설정

### Claude Desktop

`claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "korea-transit": {
      "url": "https://koreatransitmcp.vercel.app/mcp"
    }
  }
}
```

### Cursor / 기타 MCP 클라이언트

```json
{
  "korea-transit": {
    "url": "https://koreatransitmcp.vercel.app/mcp"
  }
}
```

## 사용 예시

```
"강남역 지하철 언제 와?"
"2호선 운행 상태 알려줘"
"시청 근처 버스정류장 찾아줘"
"22341 정류장 버스 도착정보"
"여의도 따릉이 대여소 현황"
"홍대입구 주변 교통정보 전부 알려줘"
```

## 로컬 개발

### 설치

```bash
git clone https://github.com/heisenbug0306-tech/korea-transit-mcp.git
cd korea-transit-mcp
npm install
```

### 환경변수 설정

`.env` 파일 생성:

```env
SEOUL_API_KEY=서울열린데이터광장_API_키
DATA_GO_KR_API_KEY=공공데이터포털_API_키
```

### 실행

```bash
npm run build
npm start
```

### API 키 발급

| API | 발급처 | 용도 |
|-----|--------|------|
| SEOUL_API_KEY | [서울 열린데이터광장](https://data.seoul.go.kr) | 지하철, 따릉이, 버스정류장 |
| DATA_GO_KR_API_KEY | [공공데이터포털](https://www.data.go.kr) | 버스 도착정보 |

## 기술 스택

- TypeScript
- Vercel Serverless Functions
- MCP (Model Context Protocol)

## 라이선스

MIT

---

*Korea Transit MCP Server v1.0.0*
