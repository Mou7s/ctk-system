<template>
    <div>
        <UTabs type="border-card">
            <UTabPanel label="秒" v-if="shouldHide('second')">
                <CrontabSecond
                    @update="updateCrontabValue"
                    :check="checkNumber"
                    :cron="crontabValueObj"
                    ref="cronsecond"
                />
            </UTabPanel>

            <UTabPanel label="分钟" v-if="shouldHide('min')">
                <CrontabMin
                    @update="updateCrontabValue"
                    :check="checkNumber"
                    :cron="crontabValueObj"
                    ref="cronmin"
                />
            </UTabPanel>

            <UTabPanel label="小时" v-if="shouldHide('hour')">
                <CrontabHour
                    @update="updateCrontabValue"
                    :check="checkNumber"
                    :cron="crontabValueObj"
                    ref="cronhour"
                />
            </UTabPanel>

            <UTabPanel label="日" v-if="shouldHide('day')">
                <CrontabDay
                    @update="updateCrontabValue"
                    :check="checkNumber"
                    :cron="crontabValueObj"
                    ref="cronday"
                />
            </UTabPanel>

            <UTabPanel label="月" v-if="shouldHide('month')">
                <CrontabMonth
                    @update="updateCrontabValue"
                    :check="checkNumber"
                    :cron="crontabValueObj"
                    ref="cronmonth"
                />
            </UTabPanel>

            <UTabPanel label="周" v-if="shouldHide('week')">
                <CrontabWeek
                    @update="updateCrontabValue"
                    :check="checkNumber"
                    :cron="crontabValueObj"
                    ref="cronweek"
                />
            </UTabPanel>

            <UTabPanel label="年" v-if="shouldHide('year')">
                <CrontabYear
                    @update="updateCrontabValue"
                    :check="checkNumber"
                    :cron="crontabValueObj"
                    ref="cronyear"
                />
            </UTabPanel>
        </UTabs>

        <div class="popup-main">
            <div class="popup-result">
                <p class="title">时间表达式</p>
                <table>
                    <thead>
                        <tr>
                            <th v-for="item of tabTitles" :key="item">{{item}}</th>
                            <th>Cron 表达式</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                <span v-if="crontabValueObj.second.length < 10">{{crontabValueObj.second}}</span>
                                <UTooltip  v-else :text="crontabValueObj.second" placement="top"><span>{{crontabValueObj.second}}</span></UTooltip>
                            </td>
                            <td>
                                <span v-if="crontabValueObj.min.length < 10">{{crontabValueObj.min}}</span>
                                <UTooltip  v-else :text="crontabValueObj.min" placement="top"><span>{{crontabValueObj.min}}</span></UTooltip>
                            </td>
                            <td>
                                <span v-if="crontabValueObj.hour.length < 10">{{crontabValueObj.hour}}</span>
                                <UTooltip  v-else :text="crontabValueObj.hour" placement="top"><span>{{crontabValueObj.hour}}</span></UTooltip>
                            </td>
                            <td>
                                <span v-if="crontabValueObj.day.length < 10">{{crontabValueObj.day}}</span>
                                <UTooltip  v-else :text="crontabValueObj.day" placement="top"><span>{{crontabValueObj.day}}</span></UTooltip>
                            </td>
                            <td>
                                <span v-if="crontabValueObj.month.length < 10">{{crontabValueObj.month}}</span>
                                <UTooltip  v-else :text="crontabValueObj.month" placement="top"><span>{{crontabValueObj.month}}</span></UTooltip>
                            </td>
                            <td>
                                <span v-if="crontabValueObj.week.length < 10">{{crontabValueObj.week}}</span>
                                <UTooltip  v-else :text="crontabValueObj.week" placement="top"><span>{{crontabValueObj.week}}</span></UTooltip>
                            </td>
                            <td>
                                <span v-if="crontabValueObj.year.length < 10">{{crontabValueObj.year}}</span>
                                <UTooltip  v-else :text="crontabValueObj.year" placement="top"><span>{{crontabValueObj.year}}</span></UTooltip>
                            </td>
                            <td class="result">
                                <span v-if="crontabValueString.length < 90">{{crontabValueString}}</span>
                                <UTooltip  v-else :text="crontabValueString" placement="top"><span>{{crontabValueString}}</span></UTooltip>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <CrontabResult :ex="crontabValueString"></CrontabResult>

            <div class="pop_btn">
                <UButton color="primary" @click="submitFill">确定</UButton>
                <UButton color="warning" @click="clearCron">重置</UButton>
                <UButton @click="hidePopup">取消</UButton>
            </div>
        </div>
    </div>
</template>

<script setup>
import CrontabSecond from "./second.vue"
import CrontabMin from "./min.vue"
import CrontabHour from "./hour.vue"
import CrontabDay from "./day.vue"
import CrontabMonth from "./month.vue"
import CrontabWeek from "./week.vue"
import CrontabYear from "./year.vue"
import CrontabResult from "./result.vue"
const { proxy } = getCurrentInstance()
const emit = defineEmits(['hide', 'fill'])
const props = defineProps({
    hideComponent: {
        type: Array,
        default: () => [],
    },
    expression: {
        type: String,
        default: ""
    }
})
const tabTitles = ref(["秒", "分钟", "小时", "日", "月", "周", "年"])
const tabActive = ref(0)
const hideComponent = ref([])
const expression = ref('')
const crontabValueObj = ref({
    second: "*",
    min: "*",
    hour: "*",
    day: "*",
    month: "*",
    week: "?",
    year: "",
})
const crontabValueString = computed(() => {
    const obj = crontabValueObj.value
    return obj.second
        + " "
        + obj.min
        + " "
        + obj.hour
        + " "
        + obj.day
        + " "
        + obj.month
        + " "
        + obj.week
        + (obj.year === "" ? "" : " " + obj.year)
})
watch(expression, () => resolveExp())
function shouldHide(key) {
    return !(hideComponent.value && hideComponent.value.includes(key))
}
function resolveExp() {
    // 反解析 表达式
    if (expression.value) {
        const arr = expression.value.split(/\s+/)
        if (arr.length >= 6) {
            //6 位以上是合法表达式
            let obj = {
                second: arr[0],
                min: arr[1],
                hour: arr[2],
                day: arr[3],
                month: arr[4],
                week: arr[5],
                year: arr[6] ? arr[6] : ""
            }
            crontabValueObj.value = {
                ...obj,
            }
        }
    } else {
        // 没有传入的表达式 则还原
        clearCron()
    }
}
// tab切换值
function tabCheck(index) {
    tabActive.value = index
}
// 由子组件触发，更改表达式组成的字段值
function updateCrontabValue(name, value, from) {
    crontabValueObj.value[name] = value
}
// 表单选项的子组件校验数字格式（通过-props传递）
function checkNumber(value, minLimit, maxLimit) {
    // 检查必须为整数
    value = Math.floor(value)
    if (value < minLimit) {
        value = minLimit
    } else if (value > maxLimit) {
        value = maxLimit
    }
    return value
}
// 隐藏弹窗
function hidePopup() {
    emit("hide")
}
// 填充表达式
function submitFill() {
    emit("fill", crontabValueString.value)
    hidePopup()
}
function clearCron() {
    // 还原选择项
    crontabValueObj.value = {
        second: "*",
        min: "*",
        hour: "*",
        day: "*",
        month: "*",
        week: "?",
        year: "",
    }
}
onMounted(() => {
    expression.value = props.expression
    hideComponent.value = props.hideComponent
})
</script>

<style  scoped>
.pop_btn {
    text-align: center;
    margin-top: 20px;
}
.popup-main {
    position: relative;
    margin: 10px auto;
    background: #fff;
    border-radius: 5px;
    font-size: 12px;
    overflow: hidden;
}
.popup-title {
    overflow: hidden;
    line-height: 34px;
    padding-top: 6px;
    background: #f2f2f2;
}
.popup-result {
    box-sizing: border-box;
    line-height: 24px;
    margin: 25px auto;
    padding: 15px 10px 10px;
    border: 1px solid #ccc;
    position: relative;
}
.popup-result .title {
    position: absolute;
    top: -28px;
    left: 50%;
    width: 140px;
    font-size: 14px;
    margin-left: -70px;
    text-align: center;
    line-height: 30px;
    background: #fff;
}
.popup-result table {
    text-align: center;
    width: 100%;
    margin: 0 auto;
}
.popup-result table td:not(.result) {
    width: 3.5rem;
    min-width: 3.5rem;
    max-width: 3.5rem;
}
.popup-result table span {
    display: block;
    width: 100%;
    font-family: arial;
    line-height: 30px;
    height: 30px;
    white-space: nowrap;
    overflow: hidden;
    border: 1px solid #e8e8e8;
}
.popup-result-scroll {
    font-size: 12px;
    line-height: 24px;
    height: 10em;
    overflow-y: auto;
}
/* 深色模式：本组件样式写死浅色（#fff/#f2f2f2/#e8e8e8），整体切到应用调色板令牌 */
html.dark .popup-main {
    background: var(--app-surface);
    color: var(--app-text);
}
html.dark .popup-title {
    background: var(--app-page-hover);
    color: var(--app-text);
}
html.dark .popup-result {
    border-color: var(--app-border);
}
html.dark .popup-result .title {
    background: var(--app-surface);
    color: var(--app-text);
}
html.dark .popup-result table {
    color: var(--app-text);
}
html.dark .popup-result table span {
    border-color: var(--app-border);
    color: var(--app-text);
}
</style>