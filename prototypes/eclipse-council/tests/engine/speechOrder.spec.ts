import {describe,expect,it} from 'vitest'
import {speechOrder} from '@/game/rules/speechOrder'
describe('项目发言顺序',()=>{
 it('不受死亡位置影响，按存活号码递增',()=>expect(speechOrder([3,8],[9,7,1,4,2])).toEqual([1,2,4,7,9]))
 it('空场不生成发言席位',()=>expect(speechOrder([1],[])).toEqual([]))
})
