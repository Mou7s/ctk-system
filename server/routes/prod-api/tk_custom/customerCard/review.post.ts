import { customerCardAction } from '../../../../utils/customer-cards'

export default defineEventHandler(event => customerCardAction(event, 'review'))
