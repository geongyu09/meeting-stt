// 정답과 인식 결과를 글자 단위로 정렬해 "정답의 어느 글자에서 틀렸는지"를 돌려준다.
// cer.ts의 computeCer는 개수만 세지만, 화자별·구간별 CER을 내려면 오류의 위치가 필요하다
// (docs/recording-quality-results.md 3절).

const OP_MATCH = 0
const OP_SUBSTITUTE = 1
const OP_DELETE = 2
const OP_INSERT = 3

interface AlignParams {
  hypothesis: string[]
  reference: string[]
}

/**
 * 역추적용 연산 표. 4만 자 × 4만 자면 1.6GB라 칸마다 1바이트만 쓰고, 비용은 두 행만 굴린다.
 * 동점이면 computeCer와 같은 순서(대각 → 삭제 → 삽입)로 고른다.
 */
const buildOperations = ({ hypothesis, reference }: AlignParams) => {
  const width = hypothesis.length + 1
  const operations = new Uint8Array((reference.length + 1) * width)
  let prev = Int32Array.from({ length: width }, (_, j) => j)
  let cur = new Int32Array(width)
  operations.fill(OP_INSERT, 0, width)

  for (let i = 1; i <= reference.length; i += 1) {
    const row = i * width
    cur[0] = i
    operations[row] = OP_DELETE

    for (let j = 1; j < width; j += 1) {
      const isSame = hypothesis[j - 1] === reference[i - 1]
      const diagonal = prev[j - 1] + (isSame ? 0 : 1)
      const deletion = prev[j] + 1
      const insertion = cur[j - 1] + 1

      if (diagonal <= deletion && diagonal <= insertion) {
        cur[j] = diagonal
        operations[row + j] = isSame ? OP_MATCH : OP_SUBSTITUTE
      } else if (deletion <= insertion) {
        cur[j] = deletion
        operations[row + j] = OP_DELETE
      } else {
        cur[j] = insertion
        operations[row + j] = OP_INSERT
      }
    }

    ;[prev, cur] = [cur, prev]
  }

  return operations
}

/**
 * 정답 글자마다 치환·삭제·삽입 개수를 센다. 삽입은 바로 앞 정답 글자에 붙인다
 * (맨 앞에 끼어든 삽입은 첫 글자에).
 */
export const alignErrors = ({ hypothesis, reference }: AlignParams) => {
  const width = hypothesis.length + 1
  const operations = buildOperations({ hypothesis, reference })
  const substitutions = new Uint8Array(reference.length)
  const deletions = new Uint8Array(reference.length)
  const insertions = new Uint16Array(reference.length)
  let i = reference.length
  let j = hypothesis.length

  while (i > 0 || j > 0) {
    const operation = operations[i * width + j]

    if (operation === OP_INSERT) {
      if (reference.length > 0) insertions[Math.max(0, i - 1)] += 1
      j -= 1
      continue
    }
    if (operation === OP_DELETE) {
      deletions[i - 1] = 1
      i -= 1
      continue
    }
    if (operation === OP_SUBSTITUTE) substitutions[i - 1] = 1
    i -= 1
    j -= 1
  }

  return { substitutions, deletions, insertions }
}
